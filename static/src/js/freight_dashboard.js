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

        onMounted(() => this._loadData());
    }

    // ── Data Fetching ─────────────────────────────────────────
    async _loadData() {
        try {
            const data = await rpc("/freight/dashboard/data", {});
            Object.assign(this.state.tripCounts, data.trip_counts);
            this.state.loading = false;
        } catch (e) {
            console.error("Freight Dashboard: failed to load data", e);
            this.state.loading = false;
        }
    }

    // ── Navigation helpers ────────────────────────────────────
    _openTrips(state = null) {
        // If state is an event object (from unbound click), ignore it
        if (state && typeof state !== 'string') {
            state = null;
        }
        const domain = state ? [["state", "=", state]] : [];
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