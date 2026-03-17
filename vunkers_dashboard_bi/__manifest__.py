{
    'name': 'Vunkers BI Dashboard',
    'version': '18.0.1.0.0',
    'category': 'Reporting',
    'summary': 'Dashboard de Business Intelligence con análisis de suscripciones, ventas y clientes',
    'description': """
        Dashboard BI completo para Vunkers con:
        - Resumen de suscripciones por Business Unit
        - Evolución histórica de ventas
        - Explorador y directorio de clientes
        - Ranking de facturación (clientes, categorías, productos)
        - Análisis de suscripciones (MRR, ARR, distribución)
        - Filtros jerárquicos (BU → Clase → Familia → Producto)
    """,
    'author': 'Vunkers IT Experts',
    'website': 'https://www.vunkers.com',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'account',
        'analytic',
        'product',
        'sale_subscription',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/service_type_data.xml',
        'views/dashboard_templates.xml',
        'views/business_unit_views.xml',
        'views/menu.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
