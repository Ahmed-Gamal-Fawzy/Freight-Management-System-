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
            selectedMonth: "",
            availableYears: [],
            selectedTripId: null,
            selectedTrip: null,
            selectedDriverId: null,
            availableDrivers: [],
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
            currentPage: 1,
            pageSize: 10,
        });

        this._openTrips = this._openTrips.bind(this);
        this._openTrip = this._openTrip.bind(this);
        this.onChangeYear = this.onChangeYear.bind(this);
        this.onChangeMonth = this.onChangeMonth.bind(this);
        this.onChangeDriver = this.onChangeDriver.bind(this);
        this._openProfitabilityDetails = this._openProfitabilityDetails.bind(this);
        this.onSelectTrip = this.onSelectTrip.bind(this);
        this.onClearTrip = this.onClearTrip.bind(this);
        this.changePage = this.changePage.bind(this);

        onMounted(() => this._loadData());
    }


    get filteredTrips() {
        return this.state.tripProfitability;
    }

    get driverFilteredTrips() {
        if (!this.state.selectedDriverId) return [];
        return this.state.tripProfitability.filter(
            t => t.driver_id === this.state.selectedDriverId
        );
    }

    get selectedDriverName() {
        const drv = this.state.availableDrivers.find(d => d.id === this.state.selectedDriverId);
        return drv ? drv.name : "";
    }

    get totalPages() {
        return Math.ceil(this.filteredTrips.length / this.state.pageSize) || 1;
    }

    get paginatedTrips() {
        const start = (this.state.currentPage - 1) * this.state.pageSize;
        const end = start + this.state.pageSize;
        return this.filteredTrips.slice(start, end);
    }

    changePage(newPage) {
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.state.currentPage = newPage;
        }
    }

    async _loadData() {
        try {
            this.state.loading = true;
            let params = { year: this.state.selectedYear };
            if (this.state.selectedMonth) {
                params.month = parseInt(this.state.selectedMonth);
            }
            const data = await rpc("/freight/dashboard/data", params);

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

            // Build available drivers list from returned trips
            const driversMap = {};
            for (const t of this.state.tripProfitability) {
                if (t.driver_id && !driversMap[t.driver_id]) {
                    driversMap[t.driver_id] = t.driver;
                }
            }
            this.state.availableDrivers = Object.entries(driversMap)
                .map(([id, name]) => ({ id: parseInt(id), name }))
                .sort((a, b) => a.name.localeCompare(b.name));

            // Reset driver filter if selected driver no longer exists
            if (this.state.selectedDriverId) {
                const stillExists = this.state.availableDrivers.some(
                    d => d.id === this.state.selectedDriverId
                );
                if (!stillExists) this.state.selectedDriverId = null;
            }

            this.state.currentPage = 1;

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
        this.state.currentPage = 1;
        await this._loadData();
    }

    async onChangeDriver(ev) {
        const val = ev.target.value;
        this.state.selectedDriverId = val ? parseInt(val) : null;
        this.state.currentPage = 1;
    }

    async onChangeMonth(ev) {
        this.state.selectedMonth = ev.target.value;
        this.state.selectedTripId = null;
        this.state.selectedTrip = null;
        this.state.currentPage = 1;
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

    _getFilterDomain() {
        let domain = [];
        if (this.state.selectedYear) {
            let start = `${this.state.selectedYear}-01-01 00:00:00`;
            let end = `${this.state.selectedYear}-12-31 23:59:59`;

            if (this.state.selectedMonth) {
                let m = parseInt(this.state.selectedMonth);
                let lastDay = new Date(this.state.selectedYear, m, 0).getDate();
                let mStr = m.toString().padStart(2, '0');
                start = `${this.state.selectedYear}-${mStr}-01 00:00:00`;
                end = `${this.state.selectedYear}-${mStr}-${lastDay} 23:59:59`;
            }
            domain.push(["create_date", ">=", start]);
            domain.push(["create_date", "<=", end]);
        }
        if (this.state.selectedDriverId) {
            domain.push(["driver_id", "=", this.state.selectedDriverId]);
        }
        return domain;
    }

    _openTrips(state = null) {
        let domain = state ? [["state", "=", state]] : [];
        domain = domain.concat(this._getFilterDomain());
        
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
        let domain = this._getFilterDomain();
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