# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request


class FreightDashboardController(http.Controller):

    @http.route(
        '/freight/dashboard/data',
        type='json',
        auth='user',
        methods=['POST'],
    )
    def get_dashboard_data(self, **kwargs):
        """
        Returns all KPI data needed by the Management Dashboard.
        Step 1 → Trip counts per state.
        """
        Trip = request.env['freight.trip']

        # ── Trip Counts ──────────────────────────────────────────
        states = ['draft', 'confirmed', 'in_transit', 'delivered', 'invoiced']
        trip_counts = {}
        for state in states:
            trip_counts[state] = Trip.search_count([('state', '=', state)])

        trip_counts['total'] = sum(trip_counts.values())

        return {
            'trip_counts': trip_counts,
        }