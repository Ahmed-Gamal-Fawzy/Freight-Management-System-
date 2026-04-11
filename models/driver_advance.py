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
        ('draft', 'Draft'),
        ('in_settlement', 'In Settlement'),
        ('paid', 'Fully Settled'),
        ('rejected', 'Rejected'),
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

            if rec.state != 'rejected':
                if confirmed_expenses <= 0:
                    rec.state = 'draft'
                elif confirmed_expenses < rec.amount:
                    rec.state = 'in_settlement'
                else:
                    rec.state = 'paid'
    # ── Actions ──────────────────────────────────────────────────
    def action_reject(self):
        for rec in self:
            if rec.state == 'paid':
                raise UserError(_("Cannot reject a fully paid advance!"))
        self.write({'state': 'rejected'})

    def action_draft(self):
        self.write({'state': 'draft'})
