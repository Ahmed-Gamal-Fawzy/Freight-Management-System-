# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import UserError

class DriverAdvance(models.Model):
    _name = 'driver.advance'
    _description = 'Driver Advance'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Advance Reference',
        required=True, copy=False,
        readonly=True, index=True,
        default=lambda self: 'New'
    )

    # ── Links ────────────────────────────────────────────────────
    trip_id = fields.Many2one(
        'freight.trip', string='Trip',
        required=True, ondelete='restrict',
        tracking=True
    )
    driver_id = fields.Many2one(
        'hr.employee', string='Driver',
        related='trip_id.driver_id',
        store=True, readonly=True
    )

    # ── Financial ────────────────────────────────────────────────
    amount = fields.Monetary(
        string='Amount Disbursed',
        required=True, tracking=True
    )
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id
    )

    journal_id = fields.Many2one(
        'account.journal',
        string='Payment Method (Journal)',
        domain="[('type', 'in', ('bank', 'cash'))]",
        required=True,
        tracking=True
    )
    

    # ── Dates ────────────────────────────────────────────────────
    date = fields.Date(
        string='Issue Date',
        required=True,
        default=fields.Date.today,
        tracking=True
    )

    # ── Notes ────────────────────────────────────────────────────
    notes = fields.Text(string='Notes')
    disbursed_by = fields.Many2one(
        'res.users', string='Disbursed By',
        default=lambda self: self.env.user,
        readonly=True
    )

    # ── Status ───────────────────────────────────────────────────
    state = fields.Selection([
        ('draft',         'Draft'),
        ('in_settlement', 'In Settlement'),
        ('paid',          'Fully Settled'),
        ('rejected',      'Rejected'),
    ], string='Status', default='draft', tracking=True, copy=False)

    # ── Expenses ─────────────────────────────────────────────────
    expense_ids = fields.One2many(
        'trip.expense', 'advance_id',
        string='Trip Expenses'
    )
    total_expenses = fields.Monetary(
        string='Total Expenses',
        compute='_compute_expense_totals',
        store=True
    )
    expense_difference = fields.Monetary(
        string='Balance',
        compute='_compute_expense_totals',
        store=True,
        help="Positive = Driver owes company | Negative = Company owes driver"
    )
    difference_type = fields.Selection([
        ('in_favor_company', 'Driver Owes Company'),
        ('in_favor_driver',  'Company Owes Driver'),
        ('balanced',         'Balanced'),
    ], string='Balance Direction',
       compute='_compute_expense_totals',
       store=True
    )

    # ── Payment Source ───────────────────────────────────────────
    payment_account_id = fields.Many2one(
        'account.account',
        string='Company Payment Account',
        help="The Cash/Bank account from which the advance was disbursed",
        tracking=True
    )

    # ── ORM ──────────────────────────────────────────────────────
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = (
                    self.env['ir.sequence'].next_by_code('driver.advance') or 'New'
                )
        return super().create(vals_list)

    # ── Compute ──────────────────────────────────────────────────
    @api.depends('expense_ids.amount', 'expense_ids.state', 'amount')
    def _compute_expense_totals(self):
        for rec in self:
            confirmed_expenses = sum(
                e.amount for e in rec.expense_ids
                if e.state == 'confirmed'
            )
            rec.total_expenses = confirmed_expenses
            diff = rec.amount - confirmed_expenses
            rec.expense_difference = abs(diff)

            if diff > 0:
                rec.difference_type = 'in_favor_company'
            elif diff < 0:
                rec.difference_type = 'in_favor_driver'
            else:
                rec.difference_type = 'balanced'

    # ── Actions ──────────────────────────────────────────────────
    def action_reject(self):
        for rec in self:
            if rec.state == 'paid':
                raise UserError(_("Cannot reject a fully paid advance!"))
        self.write({'state': 'rejected'})

    def action_draft(self):
        self.write({'state': 'draft'})

    # ── Disburse Advance ─────────────────────────────────────────
    def action_disburse_advance(self):
        self.ensure_one()

        if self.state == 'rejected':
            raise UserError(_("Cannot disburse a rejected advance!"))

        if not self.payment_account_id:
            raise UserError(_("Please select Company Payment Account!"))

        if not self.journal_id:
            raise UserError(_("Please select Payment Journal!"))

        ICP = self.env['ir.config_parameter'].sudo()
        advance_account_id = int(ICP.get_param(
            'freight_management_system.driver_advance_account_id', 0))
        advance_account = self.env['account.account'].browse(advance_account_id)

        if not advance_account:
            raise UserError(_("Driver Advance Account not configured in Settings!"))

        # Safe way to get partner
        partner_id = False
        driver = self.driver_id
        if hasattr(driver, 'address_home_id') and driver.address_home_id:
            partner_id = driver.address_home_id.id
        elif driver.user_id and driver.user_id.partner_id:
            partner_id = driver.user_id.partner_id.id
        elif driver.work_contact_id:
            partner_id = driver.work_contact_id.id

        # ──────────────────────────────────────────────────────────
        # CASE 1: Draft 
        # ──────────────────────────────────────────────────────────
        if self.state == 'draft':
            move = self.env['account.move'].create({
                'journal_id': self.journal_id.id,
                'date': self.date,
                'ref': f"{self.name} - {self.trip_id.name or 'Trip'}",
                'line_ids': [
                    (0, 0, {
                        'account_id': advance_account.id,
                        'name': f"Advance to {self.driver_id.name}",
                        'debit': self.amount,
                        'credit': 0.0,
                        'partner_id': partner_id,
                    }),
                    (0, 0, {
                        'account_id': self.payment_account_id.id,
                        'name': f"Advance Payment - {self.name}",
                        'debit': 0.0,
                        'credit': self.amount,
                        'partner_id': partner_id,
                    }),
                ],
            })
            move.action_post()

            return {
                'type': 'ir.actions.act_window',
                'name': _('Advance Journal Entry'),
                'res_model': 'account.move',
                'res_id': move.id,
                'view_mode': 'form',
                'target': 'current',
            }

        # ──────────────────────────────────────────────────────────
        # CASE 2: In Settlement + Company owes Driver
        # ──────────────────────────────────────────────────────────
        if self.state == 'in_settlement' and self.difference_type == 'in_favor_driver':
            amount_to_pay = self.expense_difference

            move = self.env['account.move'].create({
                'journal_id': self.journal_id.id,
                'date': fields.Date.today(),
                'ref': f"Driver Balance Payment - {self.name}",
                'line_ids': [
                    (0, 0, {
                        'account_id': advance_account.id,
                        'name': f"Pay driver balance - {self.name}",
                        'debit': amount_to_pay,
                        'credit': 0.0,
                        'partner_id': partner_id,
                    }),
                    (0, 0, {
                        'account_id': self.payment_account_id.id,
                        'name': f"Driver balance payment - {self.name}",
                        'debit': 0.0,
                        'credit': amount_to_pay,
                        'partner_id': partner_id,
                    }),
                ],
            })
            move.action_post()
            self.write({'state': 'paid'})

            return {
                'type': 'ir.actions.act_window',
                'name': _('Driver Balance Payment'),
                'res_model': 'account.move',
                'res_id': move.id,
                'view_mode': 'form',
                'target': 'current',
            }

        raise UserError(_("No action available for current state!"))