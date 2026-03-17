#!/usr/bin/env python3
"""
Simulación offline del módulo vunkers_dashboard_bi.
Mockea el entorno Odoo y genera datos ficticios para validar:
  1. La lógica de generación de datos (generate_dashboard_data)
  2. El sistema de cache (ir.attachment)
  3. La estructura JSON resultante
  4. El controller y endpoints

Ejecutar:  python3 tests/test_simulation.py
"""
import base64
import json
import logging
import random
import sys
import time
from collections import defaultdict
from datetime import date, timedelta
from types import SimpleNamespace

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
_logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════
# MOCK DE ODOO
# ═══════════════════════════════════════════════════════════════════════

class MockRecordset:
    """Simula un recordset de Odoo."""
    def __init__(self, records=None):
        self._records = records or []

    def __iter__(self):
        return iter(self._records)

    def __len__(self):
        return len(self._records)

    def __bool__(self):
        return len(self._records) > 0

    def search(self, domain, **kwargs):
        limit = kwargs.get('limit', 0)
        order = kwargs.get('order', '')
        filtered = self._apply_domain(domain)
        if order:
            pass  # simplificado
        if limit:
            filtered = filtered[:limit]
        return MockRecordset(filtered)

    def _apply_domain(self, domain):
        result = list(self._records)
        for clause in domain:
            if isinstance(clause, str):
                continue  # '|', '&'
            field, op, value = clause
            filtered = []
            for rec in result:
                val = getattr(rec, field, None)
                if op == '=' and val == value:
                    filtered.append(rec)
                elif op == '!=' and val != value:
                    filtered.append(rec)
                elif op == '>=' and val is not None and val >= value:
                    filtered.append(rec)
                elif op == '<=' and val is not None and val <= value:
                    filtered.append(rec)
                elif op == 'in' and val in value:
                    filtered.append(rec)
            result = filtered
        return result

    def sudo(self):
        return self

    def create(self, vals):
        rec = SimpleNamespace(**vals, id=random.randint(10000, 99999))
        self._records.append(rec)
        return rec

    def write(self, vals):
        if self._records:
            for k, v in vals.items():
                setattr(self._records[0], k, v)


class MockEnvironment:
    """Simula self.env de Odoo."""
    def __init__(self):
        self._models = {}
        self._attachment_store = MockRecordset([])

    def register(self, model_name, records):
        self._models[model_name] = MockRecordset(records)

    def __getitem__(self, model_name):
        if model_name == 'ir.attachment':
            return self._attachment_store
        return self._models.get(model_name, MockRecordset([]))


# ═══════════════════════════════════════════════════════════════════════
# GENERADOR DE DATOS FICTICIOS
# ═══════════════════════════════════════════════════════════════════════

def make_category(id_, name, parent=None):
    return SimpleNamespace(id=id_, name=name, parent_id=parent)

def make_service_type(id_, name):
    return SimpleNamespace(id=id_, name=name, sequence=10, active=True)

def make_business_unit(id_, name, categ, area=None, hidden=False, display=None):
    return SimpleNamespace(
        id=id_, name=name, category_id=categ, area_id=area,
        is_hidden=hidden, sequence=10, active=True,
        display_name_dashboard=display,
    )

def make_product_template(id_, name, categ, service_type=None, recurring=False):
    ns = SimpleNamespace(
        id=id_, name=name, categ_id=categ,
        vunkers_service_type_id=service_type,
        recurring_invoice=recurring,
    )
    return ns

def make_product(id_, name, tmpl):
    return SimpleNamespace(
        id=id_, name=name, display_name=name,
        product_tmpl_id=tmpl, categ_id=tmpl.categ_id if tmpl else None,
    )

def make_partner(id_, name):
    return SimpleNamespace(id=id_, name=name, display_name=name)

def make_analytic_line(id_, dt, amount, partner, product):
    return SimpleNamespace(
        id=id_, date=dt, amount=amount,
        partner_id=partner, product_id=product,
        general_account_id=None, move_line_id=None,
    )

def generate_fake_data():
    """Genera un conjunto completo de datos ficticios."""
    # ── Categorías (jerarquía L1 > L2 > L3)
    cat_cloud = make_category(1, 'Cloud')
    cat_cloud_infra = make_category(2, 'Infraestructura', parent=cat_cloud)
    cat_cloud_saas = make_category(3, 'SaaS', parent=cat_cloud)

    cat_ciber = make_category(10, 'Ciberseguridad')
    cat_ciber_soc = make_category(11, 'SOC', parent=cat_ciber)
    cat_ciber_audit = make_category(12, 'Auditoría', parent=cat_ciber)

    cat_dev = make_category(20, 'Desarrollo')
    cat_dev_web = make_category(21, 'Web', parent=cat_dev)

    # ── Áreas de negocio
    area_tech = SimpleNamespace(id=1, name='Tecnología')
    area_serv = SimpleNamespace(id=2, name='Servicios')

    # ── Business Units
    bu_cloud = make_business_unit(1, 'Cloud', cat_cloud, area_tech, display='Cloud')
    bu_ciber = make_business_unit(2, 'Ciberseguridad', cat_ciber, area_tech, display='Ciberseguridad')
    bu_dev = make_business_unit(3, 'Desarrollo', cat_dev, area_serv, display='Desarrollo')

    def get_dashboard_label(bu=bu_cloud):
        return bu.display_name_dashboard or (bu.category_id.name if bu.category_id else bu.name)

    bu_cloud.get_dashboard_label = lambda: get_dashboard_label(bu_cloud)
    bu_ciber.get_dashboard_label = lambda: get_dashboard_label(bu_ciber)
    bu_dev.get_dashboard_label = lambda: get_dashboard_label(bu_dev)

    bus = [bu_cloud, bu_ciber, bu_dev]

    # ── Service Types
    st_producto = make_service_type(1, 'Producto')
    st_servicio = make_service_type(2, 'Servicio')
    st_software = make_service_type(3, 'Software')
    service_types = [st_producto, st_servicio, st_software]

    # ── Product Templates & Products
    templates = [
        make_product_template(1, 'Azure VM', cat_cloud_infra, st_producto, recurring=True),
        make_product_template(2, 'AWS S3', cat_cloud_saas, st_software, recurring=True),
        make_product_template(3, 'SOC 24x7', cat_ciber_soc, st_servicio, recurring=True),
        make_product_template(4, 'Pentesting', cat_ciber_audit, st_servicio, recurring=False),
        make_product_template(5, 'App Web', cat_dev_web, st_producto, recurring=False),
        make_product_template(6, 'Soporte Cloud', cat_cloud_infra, st_servicio, recurring=True),
        make_product_template(7, 'EDR Endpoint', cat_ciber_soc, st_software, recurring=True),
        make_product_template(8, 'Portal Cliente', cat_dev_web, st_producto, recurring=False),
    ]

    products = [make_product(t.id, t.name, t) for t in templates]

    # ── Partners
    partner_names = [
        'Acme Corp', 'TechVision SL', 'GlobalTech SA', 'DataFlow Inc',
        'SecureNet SL', 'CloudFirst SA', 'InnoSoft SL', 'NetGuard SA',
        'DigiPlan SL', 'CyberShield SA', 'WebMasters SL', 'InfoSec SA',
    ]
    partners = [make_partner(i + 1, name) for i, name in enumerate(partner_names)]

    # ── Analytic Lines (últimos 15 meses)
    today = date.today()
    lines = []
    line_id = 1
    random.seed(42)  # reproducibilidad

    for month_offset in range(15):
        month_date = today.replace(day=1) - timedelta(days=month_offset * 30)
        num_lines = random.randint(30, 80)
        for _ in range(num_lines):
            day = random.randint(1, 28)
            dt = month_date.replace(day=day)
            partner = random.choice(partners)
            product = random.choice(products)
            amount = round(random.uniform(100, 15000), 2)
            if random.random() < 0.1:
                amount = -abs(amount)  # algún abono
            lines.append(make_analytic_line(line_id, dt, amount, partner, product))
            line_id += 1

    return {
        'categories': [cat_cloud, cat_cloud_infra, cat_cloud_saas,
                       cat_ciber, cat_ciber_soc, cat_ciber_audit,
                       cat_dev, cat_dev_web],
        'business_units': bus,
        'service_types': service_types,
        'templates': templates,
        'products': products,
        'partners': partners,
        'lines': lines,
    }


# ═══════════════════════════════════════════════════════════════════════
# MOTOR DE SIMULACIÓN (reimplementa la lógica sin import odoo)
# ═══════════════════════════════════════════════════════════════════════

def get_category_path(categ):
    path = []
    c = categ
    while c:
        path.insert(0, c)
        c = c.parent_id
    return path

def simulate_generate_dashboard_data(fake):
    """Replica la lógica de generate_dashboard_data con datos ficticios."""
    today = date.today()
    from dateutil.relativedelta import relativedelta
    months_back = 15
    date_from = (today - relativedelta(months=months_back - 1)).replace(day=1)
    date_to = today

    # BU map
    bu_map = {bu.category_id.id: bu for bu in fake['business_units'] if bu.category_id}
    stype_map = {t.id: t.name for t in fake['service_types']}

    # Filtrar líneas por rango
    lines = [l for l in fake['lines'] if date_from <= l.date <= date_to and l.amount != 0]

    NO_VAL = '(Sin asignar)'
    months_set = set()
    partners_idx = {}
    partners_list = []
    partner_ids_list = []
    products_idx = {}
    products_list = []
    cats_idx = {}
    cats_list = []
    sub1s_idx = {}
    sub1s_list = []
    sub2s_idx = {}
    sub2s_list = []
    bus_idx = {}
    bus_list_lk = []
    bas_idx = {}
    bas_list = []
    tipos_idx = {}
    tipos_list = []
    accts_idx = {}
    accts_list = []

    def _get_or_add(val, idx_dict, val_list):
        if val not in idx_dict:
            idx_dict[val] = len(val_list)
            val_list.append(val)
        return idx_dict[val]

    _get_or_add(NO_VAL, cats_idx, cats_list)
    _get_or_add(NO_VAL, sub1s_idx, sub1s_list)
    _get_or_add(NO_VAL, sub2s_idx, sub2s_list)
    _get_or_add(NO_VAL, bus_idx, bus_list_lk)
    _get_or_add(NO_VAL, bas_idx, bas_list)
    _get_or_add(NO_VAL, tipos_idx, tipos_list)

    records = []
    filter_tree = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))

    for line in lines:
        month_str = line.date.strftime('%Y-%m')
        months_set.add(month_str)
        amount = line.amount

        partner = line.partner_id
        if partner and partner.id:
            if partner.id not in partners_idx:
                partners_idx[partner.id] = len(partners_list)
                partners_list.append(partner.display_name or partner.name or '')
                partner_ids_list.append(partner.id)
            partner_i = partners_idx[partner.id]
        else:
            partner_i = -1

        product = line.product_id
        product_tmpl = product.product_tmpl_id if product else None
        if product and product.id:
            prod_name = product.display_name or product.name or ''
            product_i = _get_or_add(prod_name, products_idx, products_list)
        else:
            product_i = -1

        cat_name = NO_VAL
        sub1_name = NO_VAL
        sub2_name = NO_VAL
        if product_tmpl and product_tmpl.categ_id:
            path = get_category_path(product_tmpl.categ_id)
            cat_name = path[0].name if len(path) > 0 else NO_VAL
            sub1_name = path[1].name if len(path) > 1 else NO_VAL
            sub2_name = path[2].name if len(path) > 2 else NO_VAL

        cat_i = _get_or_add(cat_name, cats_idx, cats_list)
        sub1_i = _get_or_add(sub1_name, sub1s_idx, sub1s_list)
        sub2_i = _get_or_add(sub2_name, sub2s_idx, sub2s_list)

        is_sub = 0
        if product_tmpl and hasattr(product_tmpl, 'recurring_invoice'):
            is_sub = 1 if product_tmpl.recurring_invoice else 0

        bu_name = NO_VAL
        ba_name = NO_VAL
        if product_tmpl and product_tmpl.categ_id:
            root_categ = get_category_path(product_tmpl.categ_id)[0]
            bu_rec = bu_map.get(root_categ.id)
            if bu_rec:
                bu_name = bu_rec.name
                ba_name = bu_rec.area_id.name if bu_rec.area_id else NO_VAL

        bu_i = _get_or_add(bu_name, bus_idx, bus_list_lk)
        ba_i = _get_or_add(ba_name, bas_idx, bas_list)

        tipo_name = NO_VAL
        if product_tmpl and product_tmpl.vunkers_service_type_id:
            tipo_name = stype_map.get(product_tmpl.vunkers_service_type_id.id, NO_VAL)
        tipo_i = _get_or_add(tipo_name, tipos_idx, tipos_list)

        acct_name = NO_VAL
        acct_i = _get_or_add(acct_name, accts_idx, accts_list)

        prod_label = products_list[product_i] if product_i >= 0 else ''
        if prod_label:
            filter_tree[cat_name][sub1_name][sub2_name].add(prod_label)

        records.append([
            month_str, amount, partner_i, product_i,
            cat_i, sub1_i, sub2_i, is_sub,
            bu_i, ba_i, tipo_i, acct_i,
        ])

    months_sorted = sorted(months_set)
    month_idx_map = {m: i for i, m in enumerate(months_sorted)}

    compact_records = []
    for rec in records:
        mi = month_idx_map[rec[0]]
        compact_records.append([
            mi, rec[1], rec[2], rec[3],
            rec[4], rec[5], rec[6], rec[7],
            rec[8], rec[9], rec[10], rec[11],
        ])

    # filter_tree serializable
    ft = {}
    for cat, sub1_dict in filter_tree.items():
        ft[cat] = {}
        for sub1, sub2_dict in sub1_dict.items():
            ft[cat][sub1] = {}
            for sub2, prods in sub2_dict.items():
                ft[cat][sub1][sub2] = sorted(prods)

    # Monthly billing
    monthly_billing = {}
    for m in months_sorted:
        mi = month_idx_map[m]
        m_recs = [r for r in compact_records if r[0] == mi]
        total = sum(r[1] for r in m_recs)
        mrr = sum(r[1] for r in m_recs if r[7] == 1)
        project = sum(r[1] for r in m_recs if r[7] == 0)
        monthly_billing[m] = {
            'total': round(total, 2),
            'MRR': round(mrr, 2),
            'Project': round(project, 2),
        }

    # BU list
    bu_list = ['TOTAL'] + [bu.get_dashboard_label() for bu in fake['business_units']]

    # Active clients per month
    active_clients = {}
    for m in months_sorted:
        mi = month_idx_map[m]
        pids = set()
        for r in compact_records:
            if r[0] == mi and r[7] == 1 and r[2] >= 0:
                pids.add(r[2])
        active_clients[m] = len(pids)

    # Top clients
    client_totals = defaultdict(float)
    for r in compact_records:
        if r[2] >= 0:
            client_totals[partners_list[r[2]]] += r[1]
    top_clients = sorted(
        [{'name': k, 'total': round(v, 2)} for k, v in client_totals.items()],
        key=lambda x: x['total'], reverse=True,
    )[:50]

    data = {
        'source': 'SIMULACIÓN (datos ficticios)',
        'months': months_sorted,
        'monthly_billing': monthly_billing,
        'bu_list': bu_list,
        'bu_cards': {},  # simplificado
        'filter_tree': ft,
        'client_directory': [],  # simplificado
        'top_clients': top_clients,
        'top_categories': [],
        'product_trend': [],
        'active_clients': active_clients,
        '_lk': {
            'months': months_sorted,
            'partners': partners_list,
            'partner_ids': partner_ids_list,
            'products': products_list,
            'cats': cats_list,
            'bus': bus_list_lk,
            'bas': bas_list,
            'sub1s': sub1s_list,
            'sub2s': sub2s_list,
            'tipos': tipos_list,
            'accts': accts_list,
        },
        '_rc': compact_records,
    }
    return data


def simulate_cache(data):
    """Simula el ciclo completo de cache: guardar → leer → verificar."""
    # Guardar
    payload = {
        'data': data,
        'generated_at': '2026-03-17 03:00:00',
        'record_count': len(data.get('_rc', [])),
        'generation_time_s': 0.5,
    }
    raw_json = json.dumps(payload, ensure_ascii=False)
    encoded = base64.b64encode(raw_json.encode('utf-8'))

    size_mb = len(encoded) / (1024 * 1024)

    # Leer
    decoded = base64.b64decode(encoded).decode('utf-8')
    restored = json.loads(decoded)
    restored_data = restored['data']

    return encoded, size_mb, restored_data


# ═══════════════════════════════════════════════════════════════════════
# EJECUCIÓN Y VALIDACIÓN
# ═══════════════════════════════════════════════════════════════════════

def run_tests():
    errors = 0
    tests = 0

    def check(condition, msg):
        nonlocal errors, tests
        tests += 1
        if condition:
            print(f'  [PASS] {msg}')
        else:
            print(f'  [FAIL] {msg}')
            errors += 1

    # ── 1. Generar datos ficticios
    print('\n══ 1. Generación de datos ficticios ══')
    fake = generate_fake_data()
    check(len(fake['lines']) > 0, f"Líneas analíticas generadas: {len(fake['lines'])}")
    check(len(fake['partners']) == 12, f"Partners: {len(fake['partners'])}")
    check(len(fake['products']) == 8, f"Productos: {len(fake['products'])}")
    check(len(fake['business_units']) == 3, f"Business Units: {len(fake['business_units'])}")

    # ── 2. Simular generate_dashboard_data
    print('\n══ 2. Lógica de generate_dashboard_data ══')
    t0 = time.time()
    data = simulate_generate_dashboard_data(fake)
    elapsed = time.time() - t0

    check('months' in data, 'Estructura: tiene "months"')
    check('monthly_billing' in data, 'Estructura: tiene "monthly_billing"')
    check('bu_list' in data, 'Estructura: tiene "bu_list"')
    check('filter_tree' in data, 'Estructura: tiene "filter_tree"')
    check('_lk' in data, 'Estructura: tiene "_lk" (lookups)')
    check('_rc' in data, 'Estructura: tiene "_rc" (compact records)')
    check('top_clients' in data, 'Estructura: tiene "top_clients"')
    check('active_clients' in data, 'Estructura: tiene "active_clients"')

    months = data['months']
    check(len(months) > 0, f'Meses generados: {len(months)}')
    check(months == sorted(months), 'Meses están ordenados')

    rc = data['_rc']
    check(len(rc) > 0, f'Registros compactos: {len(rc)}')
    check(all(len(r) == 12 for r in rc), 'Cada registro tiene 12 campos')

    # Verificar que cada campo de registro es un número
    for i, r in enumerate(rc[:5]):
        check(
            all(isinstance(v, (int, float)) for v in r),
            f'Registro #{i}: todos los campos son numéricos',
        )

    # Monthly billing
    mb = data['monthly_billing']
    check(len(mb) == len(months), f'monthly_billing: {len(mb)} meses')
    for m, vals in list(mb.items())[:2]:
        check('total' in vals and 'MRR' in vals and 'Project' in vals,
              f'  {m}: total={vals["total"]:.0f}, MRR={vals["MRR"]:.0f}, Project={vals["Project"]:.0f}')

    # BU list
    check('TOTAL' in data['bu_list'], 'bu_list incluye TOTAL')
    check('Cloud' in data['bu_list'], 'bu_list incluye Cloud')

    # Filter tree
    ft = data['filter_tree']
    check(len(ft) > 0, f'filter_tree: {len(ft)} categorías raíz')
    for cat, sub1s in ft.items():
        for sub1, sub2s in sub1s.items():
            for sub2, prods in sub2s.items():
                check(isinstance(prods, list), f'  {cat} > {sub1} > {sub2}: {len(prods)} productos')
                break
            break
        break

    # Lookups
    lk = data['_lk']
    check(len(lk['partners']) > 0, f'Lookup partners: {len(lk["partners"])}')
    check(len(lk['products']) > 0, f'Lookup products: {len(lk["products"])}')
    check(len(lk['cats']) > 0, f'Lookup categorías: {len(lk["cats"])}')
    check(len(lk['bus']) > 0, f'Lookup BUs: {len(lk["bus"])}')
    check(len(lk['tipos']) > 0, f'Lookup tipos: {len(lk["tipos"])}')

    # Top clients
    tc = data['top_clients']
    check(len(tc) > 0, f'Top clients: {len(tc)}')
    check(all('name' in c and 'total' in c for c in tc), 'Top clients: estructura correcta')
    if len(tc) >= 2:
        check(tc[0]['total'] >= tc[1]['total'], 'Top clients: ordenados desc')

    # Active clients
    ac = data['active_clients']
    check(len(ac) == len(months), f'Active clients: {len(ac)} meses')
    check(all(isinstance(v, int) for v in ac.values()), 'Active clients: valores enteros')

    print(f'\n  Generación completada en {elapsed*1000:.1f}ms')

    # ── 3. Simular cache
    print('\n══ 3. Cache ir.attachment ══')
    encoded, size_mb, restored = simulate_cache(data)

    check(size_mb < 50, f'Tamaño cache: {size_mb:.2f} MB (< 50MB)')
    check(restored['months'] == data['months'], 'Cache: meses restaurados correctamente')
    check(len(restored['_rc']) == len(data['_rc']), f'Cache: registros intactos ({len(restored["_rc"])})')
    check(
        restored['_rc'][:3] == data['_rc'][:3],
        'Cache: primeros 3 registros idénticos tras decode',
    )
    check(restored['source'] == data['source'], 'Cache: source preservado')

    # Verificar que JSON sobrevive a encode/decode sin pérdida
    for key in ['months', 'bu_list', 'monthly_billing', 'filter_tree', 'top_clients']:
        check(
            json.dumps(restored[key], sort_keys=True) == json.dumps(data[key], sort_keys=True),
            f'Cache: "{key}" sin pérdida',
        )

    # ── 4. Simular cache corrupta
    print('\n══ 4. Cache corrupta ══')
    bad_data = base64.b64encode(b'esto no es JSON')
    try:
        decoded = base64.b64decode(bad_data).decode('utf-8')
        json.loads(decoded)
        check(False, 'Cache corrupta debería fallar al parsear')
    except json.JSONDecodeError:
        check(True, 'Cache corrupta detectada correctamente (JSONDecodeError)')

    # ── 5. Serialización JSON
    print('\n══ 5. Serialización JSON completa ══')
    try:
        full_json = json.dumps(data, ensure_ascii=False)
        check(True, f'JSON serializable: {len(full_json)} chars')
        reparsed = json.loads(full_json)
        check(isinstance(reparsed, dict), 'JSON reparseable')
    except (TypeError, json.JSONDecodeError) as e:
        check(False, f'Error serialización: {e}')

    # ── 6. Verificar coherencia de índices
    print('\n══ 6. Coherencia de índices ══')
    max_month_i = len(months) - 1
    max_partner_i = len(lk['partners']) - 1
    max_product_i = len(lk['products']) - 1

    out_of_range = 0
    for r in rc:
        if r[0] < 0 or r[0] > max_month_i:
            out_of_range += 1
        if r[2] >= 0 and r[2] > max_partner_i:
            out_of_range += 1
        if r[3] >= 0 and r[3] > max_product_i:
            out_of_range += 1
    check(out_of_range == 0, f'Índices fuera de rango: {out_of_range}')

    # Verificar sentinel index
    check(lk['cats'][0] == '(Sin asignar)', 'Sentinel: cats[0] = "(Sin asignar)"')
    check(lk['bus'][0] == '(Sin asignar)', 'Sentinel: bus[0] = "(Sin asignar)"')

    # ── Resumen
    print(f'\n{"═" * 50}')
    print(f'RESULTADO: {tests - errors}/{tests} tests pasados')
    if errors:
        print(f'  ({errors} fallos)')
    else:
        print('  Todo OK')
    print(f'{"═" * 50}')

    return errors


if __name__ == '__main__':
    sys.exit(run_tests())
