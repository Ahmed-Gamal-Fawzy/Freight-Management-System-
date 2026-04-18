/** @odoo-module */

import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { Component, onMounted, useState } from "@odoo/owl";

class FreightDashboard extends Component {
    static template = "freight_management_system.FreightDashboard";

    setup() {
        this.action = useService("action");

        this.state = useState({
            loading: true,
            selectedYear: new Date().getFullYear(),
            availableYears: [],
            selectedTripId: null,
            selectedTrip: null,
            tripCounts: {
                total: 0, draft: 0, confirmed: 0,
                in_transit: 0, delivered: 0, invoiced: 0,
            },
            totalRevenue: 0,
            totalExpenses: 0,
            totalProfit: 0,
            profitMargin: 0,
            averageProfitPerTrip: 0,
            profitableTripsCount: 0,
            lossTripsCount: 0,
            profitByState: {},
            revenueByState: {},
            expensesByState: {},
            tripProfitability: [],
        });

        this._openTrips = this._openTrips.bind(this);
        this._openTrip = this._openTrip.bind(this);
        this.onChangeYear = this.onChangeYear.bind(this);
        this._openProfitabilityDetails = this._openProfitabilityDetails.bind(this);
        this.onSelectTrip = this.onSelectTrip.bind(this);
        this.onClearTrip = this.onClearTrip.bind(this);

        onMounted(() => this._loadData());
    }

    async _loadData() {
        try {
            this.state.loading = true;
            const data = await rpc("/freight/dashboard/data", {
                year: this.state.selectedYear
            });

            if (data.trip_counts) {
                Object.assign(this.state.tripCounts, data.trip_counts);
            }

            this.state.totalRevenue         = data.total_revenue         || 0;
            this.state.totalExpenses        = data.total_expenses        || 0;
            this.state.totalProfit          = data.total_profit          || 0;
            this.state.profitMargin         = data.profit_margin         || 0;
            this.state.averageProfitPerTrip = data.average_profit_per_trip || 0;
            this.state.profitableTripsCount = data.profitable_trips_count  || 0;
            this.state.lossTripsCount       = data.loss_trips_count      || 0;
            this.state.profitByState        = data.profit_by_state       || {};
            this.state.revenueByState       = data.revenue_by_state      || {};
            this.state.expensesByState      = data.expenses_by_state     || {};
            this.state.tripProfitability    = data.trip_profitability    || [];
            this.state.availableYears       = data.years                 || [this.state.selectedYear];

            if (this.state.selectedTripId) {
                const found = this.state.tripProfitability.find(
                    t => t.id === this.state.selectedTripId
                );
                this.state.selectedTrip = found || null;
                if (!found) this.state.selectedTripId = null;
            }

            this.state.loading = false;
        } catch (e) {
            console.error("Freight Dashboard: failed to load data", e);
            this.state.loading = false;
        }
    }

    async onChangeYear(ev) {
        this.state.selectedYear = parseInt(ev.target.value);
        this.state.selectedTripId = null;
        this.state.selectedTrip = null;
        await this._loadData();
    }

    onSelectTrip(ev) {
        const tripId = parseInt(ev.target.value);
        if (!tripId) {
            this.state.selectedTripId = null;
            this.state.selectedTrip = null;
            return;
        }
        this.state.selectedTripId = tripId;
        this.state.selectedTrip = this.state.tripProfitability.find(
            t => t.id === tripId
        ) || null;
    }

    onClearTrip() {
        this.state.selectedTripId = null;
        this.state.selectedTrip = null;
    }

    getTripProfitPct(trip) {
        if (!trip || trip.revenue <= 0) return 0;
        return Math.min(Math.abs(trip.profit_margin), 100);
    }

    _openTrips(state = null) {
        let domain = state ? [["state", "=", state]] : [];
        if (this.state.selectedYear) {
            domain.push(["create_date", ">=", `${this.state.selectedYear}-01-01 00:00:00`]);
            domain.push(["create_date", "<=", `${this.state.selectedYear}-12-31 23:59:59`]);
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            name: "Freight Trips",
            res_model: "freight.trip",
            domain: domain,
            views: [[false, "list"], [false, "form"]],
        });
    }

    _openTrip(tripId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            name: "Freight Trip",
            res_model: "freight.trip",
            res_id: tripId,
            view_mode: "form",
            views: [[false, "form"]],
        });
    }

    _openProfitabilityDetails() {
        let domain = [];
        if (this.state.selectedYear) {
            domain.push(["create_date", ">=", `${this.state.selectedYear}-01-01 00:00:00`]);
            domain.push(["create_date", "<=", `${this.state.selectedYear}-12-31 23:59:59`]);
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            name: "Trip Profitability Report",
            res_model: "freight.trip",
            domain: domain,
            views: [[false, "list"], [false, "form"]],
        });
    }

    getStateDisplayName(state) {
        const names = {
            'draft': 'Draft', 'confirmed': 'Confirmed',
            'in_transit': 'In Transit', 'delivered': 'Delivered',
            'invoiced': 'Invoiced'
        };
        return names[state] || state;
    }

    formatCurrency(amount) {
        if (!amount && amount !== 0) return '0.00';
        return parseFloat(amount).toLocaleString('en-EG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    getBarWidth(profit, maxProfit) {
        if (!maxProfit || maxProfit === 0) return 0;
        return Math.min((Math.abs(profit) / maxProfit) * 100, 100);
    }

    getMaxProfit() {
        const profits = Object.values(this.state.profitByState);
        if (profits.length === 0) return 0;
        return Math.max(...profits.map(Math.abs));
    }
}

registry
    .category("actions")
    .add("freight_management_system.freight_dashboard", FreightDashboard);

export { FreightDashboard };