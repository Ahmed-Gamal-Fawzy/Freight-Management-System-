# -*- coding: utf-8 -*-
{
    "name": "Freight Management System",
    "version": "1.0",
    "category": "Tools",
    "summary": "Freight Management System",
    "description": "This helped to manage freight trips and expenses and profitability analysis",
    "author": "Ahmed Gamal Fawzy",
    "maintainer": "",
    "website": "https://www.yourcompany.com",
    "depends": ["base", "fleet", "mail", "hr", "whatsapp", "accountant", "account", "web","sale","sale_management"],
    "data": [
        "data/ir_sequence_data.xml",
        "security/security_group.xml",
        "security/ir.model.access.csv",
        "reports/report_waybill.xml",
        "data/mail_template_data.xml",
        # ─── Views ───
        "views/freight_trip_view.xml",
        "views/driver_advance_view.xml",
        "views/trip_expense_views.xml",
        "views/res_config_settings_views.xml",
        "wizard/send_mail_view.xml",
        # ─── Menus───
        "views/menu_item_view.xml",
        "views/freight_dashboard_view.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "freight_management_system/static/src/css/**/*.css",
            "freight_management_system/static/src/xml/**/*.xml",
            "freight_management_system/static/src/js/**/*.js",
        ],
    },
    "license": "LGPL-3",
    "installable": True,
    "auto_install": False,
    "application": True,
}