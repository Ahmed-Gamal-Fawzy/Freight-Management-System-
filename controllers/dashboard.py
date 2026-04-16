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
        """
        Returns all KPI data needed by the Management Dashboard.
        Step 1 → Trip counts per state.
        """
        Trip = request.env['freight.trip']

        domain = []
        if year:
            try:
                year_int = int(year)
                domain += [
                    ('create_date', '>=', f'{year_int}-01-01 00:00:00'),
                    ('create_date', '<=', f'{year_int}-12-31 23:59:59')
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

        all_trip_dates = Trip.search_read([], ['create_date'])
        available_years = sorted(
            list(set([t['create_date'].year for t in all_trip_dates if t['create_date']])), 
            reverse=True
        )

        if not available_years:
            available_years = [datetime.now().year]

        return {
            'trip_counts': trip_counts,
            'years': available_years,
        }