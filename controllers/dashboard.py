# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
from datetime import datetime

class FreightDashboardController(http.Controller):

    @http.route(
        '/freight/dashboard/data',
        type='json',
        auth='user',
        methods=['POST'],
    )
    def get_dashboard_data(self, year=None, **kwargs):
        Trip = request.env['freight.trip']

        domain = []
        if year:
            try:
                year_int = int(year)
                start_date = f'{year_int}-01-01 00:00:00'
                end_date = f'{year_int}-12-31 23:59:59'

                if kwargs.get('month'):
                    try:
                        month_int = int(kwargs.get('month'))
                        if 1 <= month_int <= 12:
                            import calendar
                            _, last_day = calendar.monthrange(year_int, month_int)
                            month_str = str(month_int).zfill(2)
                            start_date = f'{year_int}-{month_str}-01 00:00:00'
                            end_date = f'{year_int}-{month_str}-{last_day} 23:59:59'
                    except (ValueError, TypeError):
                        pass

                domain += [
                    ('create_date', '>=', start_date),
                    ('create_date', '<=', end_date)
                ]
            except (ValueError, TypeError):
                pass


        # ── Trip Counts ──────────────────────────────────────────
        states = ['draft', 'confirmed', 'in_transit', 'delivered', 'invoiced']
        trip_counts = {}
        for state in states:
            state_domain = domain + [('state', '=', state)]
            trip_counts[state] = Trip.search_count(state_domain)
        trip_counts['total'] = sum(trip_counts.values())

        # ── Helper: get confirmed expenses for a trip ─────────────
        def get_confirmed_expenses(trip):
            advances = request.env['driver.advance'].search([('trip_id', '=', trip.id)])
            return sum(
                expense.amount
                for advance in advances
                for expense in advance.expense_ids
                if expense.state == 'confirmed'
            )

        # ── Profitability Metrics ─────────────────────────────────
        all_trips = Trip.search(domain)

        total_revenue = 0.0
        total_expenses = 0.0
        total_profit = 0.0

        profit_by_state  = {s: 0.0 for s in states}
        revenue_by_state = {s: 0.0 for s in states}
        expenses_by_state = {s: 0.0 for s in states}

        profitable_trips_count = 0
        loss_trips_count = 0
        trip_profitability = []

        for trip in all_trips:
            revenue = trip.freight_charge + trip.additional_services_amount
            confirmed_expenses = get_confirmed_expenses(trip)
            profit = revenue - confirmed_expenses

            total_revenue   += revenue
            total_expenses  += confirmed_expenses
            total_profit    += profit

            profit_by_state[trip.state]   += profit
            revenue_by_state[trip.state]  += revenue
            expenses_by_state[trip.state] += confirmed_expenses

            if profit > 0:
                profitable_trips_count += 1
            elif profit < 0:
                loss_trips_count += 1

            profit_margin_trip = round((profit / revenue * 100), 2) if revenue > 0 else 0.0

            trip_profitability.append({
                'id':            trip.id,
                'name':          trip.name,
                'state':         trip.state,
                'customer':      trip.partner_id.name if trip.partner_id else '',
                'driver':        trip.driver_id.name  if trip.driver_id  else '',
                'revenue':       revenue,
                'expenses':      confirmed_expenses,
                'profit':        profit,
                'profit_margin': profit_margin_trip,
            })

        trip_profitability.sort(key=lambda x: x['id'], reverse=True)

        profit_margin = round((total_profit / total_revenue * 100), 2) if total_revenue > 0 else 0.0
        average_profit_per_trip = round(total_profit / len(all_trips), 2) if all_trips else 0.0

        # ── Available Years ───────────────────────────────────────
        all_trip_dates = Trip.search_read([], ['create_date'])
        available_years = sorted(
            list(set([
                t['create_date'].year
                for t in all_trip_dates
                if t['create_date']
            ])),
            reverse=True
        )
        if not available_years:
            available_years = [datetime.now().year]

        return {
            'trip_counts':             trip_counts,
            'years':                   available_years,
            'total_revenue':           total_revenue,
            'total_expenses':          total_expenses,
            'total_profit':            total_profit,
            'profit_margin':           profit_margin,
            'average_profit_per_trip': average_profit_per_trip,
            'profitable_trips_count':  profitable_trips_count,
            'loss_trips_count':        loss_trips_count,
            'total_trips_count':       len(all_trips),
            'profit_by_state':         profit_by_state,
            'revenue_by_state':        revenue_by_state,
            'expenses_by_state':       expenses_by_state,
            'trip_profitability':      trip_profitability,
        }