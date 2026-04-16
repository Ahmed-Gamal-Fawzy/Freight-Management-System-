/** @odoo-module */

import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { Component, onMounted, useState } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────
//  Freight Management Dashboard  –  Step 1: Trip Counts
// ─────────────────────────────────────────────────────────────

class FreightDashboard extends Component {
    static template = "freight_management_system.FreightDashboard";

    setup() {
        super.setup();
        this.action = useService("action");

        this.state = useState({
            loading: true,
            selectedYear: new Date().getFullYear(),
            availableYears: [],
            tripCounts: {
                total:      0,
                draft:      0,
                confirmed:  0,
                in_transit: 0,
                delivered:  0,
                invoiced:   0,
            },
        });

        // Bind methods to preserve 'this' context
        this._openTrips = this._openTrips.bind(this);
        this.onChangeYear = this.onChangeYear.bind(this);
        onMounted(() => this._loadData());
    }

    // ── Data Fetching ─────────────────────────────────────────
    async _loadData() {
        try {

            const data = await rpc("/freight/dashboard/data", {
                year: this.state.selectedYear
            });
            Object.assign(this.state.tripCounts, data.trip_counts);

            this.state.availableYears = data.years || [this.state.selectedYear];
            this.state.loading = false;

        } catch (e) {
            console.error("Freight Dashboard: failed to load data", e);
            this.state.loading = false;
        }
    }

    // ── Year Change Handler ───────────────────────────────────
    async onChangeYear(ev) {
        this.state.selectedYear = parseInt(ev.target.value);
        this.state.loading = true;
        await this._loadData();
    }

    // ── Navigation helpers ────────────────────────────────────
    _openTrips(state = null) {
        // If state is an event object (from unbound click), ignore it
        if (state && typeof state !== 'string') {
            state = null;
        }
        let domain = state ? [["state", "=", state]] : [];
        if (this.state.selectedYear) {
            domain.push(["create_date", ">=", `${this.state.selectedYear}-01-01 00:00:00`]);
            domain.push(["create_date", "<=", `${this.state.selectedYear}-12-31 23:59:59`]);
        }

        this.action.doAction({
            type:      "ir.actions.act_window",
            name:      "Freight Trips",
            res_model: "freight.trip",
            domain,
            views: [
                [false, "list"],
                [false, "form"]
            ],
        });
    }
}

// Register as a client action
registry
    .category("actions")
    .add("freight_management_system.freight_dashboard", FreightDashboard);

export { FreightDashboard };