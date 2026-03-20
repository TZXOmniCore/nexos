/* ============================================================
   NexOS v3.0 — segments.js
   Configuração completa por segmento de negócio.
   Cada segmento define: nomes, campos, ícones, cores,
   layout do formulário OS, documentos e KPIs do dashboard.
   ============================================================ */

const SEGMENTS = {

  // ── SEGMENTO ATIVO ─────────────────────────────────────────
  _current: null,

  get current() {
    // Valida se _current tem os dados completos — se não, busca direto dos configs
    const valid = this._current &&
                  this._current.os_form_fields &&
                  this._current.os_form_fields.length > 0 &&
                  this._current.labels &&
                  Object.keys(this._current.labels.pt || {}).length > 0;
    if (!valid) {
      const saved = localStorage.getItem('nexos_segment') || 'tech';
      this._current = this.configs[saved] || this.configs.tech;
    }
    return this._current;
  },

  set(segmentId) {
    if (!this.configs[segmentId]) return;
    this._current = this.configs[segmentId];
    localStorage.setItem('nexos_segment', segmentId);
    this.apply();
  },

  // Atalho para pegar tradução do segmento no idioma atual
  t(key) {
    const lang = I18N.lang;
    const seg = this.current;
    return seg.labels[lang]?.[key] || seg.labels['pt'][key] || key;
  },

  // Aplica os nomes do segmento em toda a interface
  apply() {
    const seg = this.current;
    // Atualiza ícones do nav
    Object.entries(seg.nav_icons).forEach(([page, icon]) => {
      const el = document.querySelector(`[data-nav="${page}"] .nav-icon`);
      if (el) el.innerHTML = this._icon(icon);
    });
    // Atualiza cores de destaque se o segmento tiver cor própria
    if (seg.accent_color) {
      document.documentElement.style.setProperty('--segment-accent', seg.accent_color);
    }
  },

  _icon(name) {
    return `<i data-lucide="${name}" style="width:16px;height:16px;stroke-width:2"></i>`;
  },

  // ══════════════════════════════════════════════════════════
  //  CONFIGURAÇÕES POR SEGMENTO
  // ══════════════════════════════════════════════════════════
  configs: {

    /* ── 1. ASSISTÊNCIA TÉCNICA ──────────────────────────── */
    tech: {
      id: 'tech',
      accent_color: '#38BDF8',

      // Ícones do menu por segmento
      nav_icons: {
        dashboard:     'layout-dashboard',
        os:            'clipboard-list',
        clients:       'users',
        stock:         'package',
        cash:          'wallet',
        schedule:      'calendar-days',
        analytics:     'bar-chart-3',
        ai:            'sparkles',
        notifications: 'bell',
        settings:      'settings',
      },

      // Rótulos traduzidos por idioma
      labels: {
        pt: {
          os_module:        'Ordens de Serviço',
          os_single:        'Ordem de Serviço',
          os_new:           'Nova OS',
          os_number:        'Nº OS',
          document_main:    'Ordem de Serviço',
          document_receipt: 'Comprovante',
          document_budget:  'Orçamento',
          document_warranty:'Garantia',
          client_item:      'Equipamento',
          client_items:     'Equipamentos',
          item_field:       'Equipamento',
          item_placeholder: 'Ex: iPhone 13 Pro, Samsung A52...',
          defect_field:     'Defeito Relatado',
          defect_placeholder:'Ex: Tela quebrada, não liga...',
          diagnosis_field:  'Diagnóstico Técnico',
          staff_field:      'Técnico Responsável',
          staff_plural:     'Técnicos',
          service_field:    'Serviço',
          parts_field:      'Peças Utilizadas',
          warranty_field:   'Garantia (dias)',
          extra_field_1:    'IMEI / Número de Série',
          extra_field_2:    'Senha do Dispositivo',
          extra_field_3:    'Acessórios Entregues',
          kpi_primary:      'OS Abertas',
          kpi_secondary:    'Concluídas Hoje',
          kpi_tertiary:     'Faturamento do Mês',
          kpi_4th:          'Técnicos Ativos',
        },
        en: {
          os_module:        'Work Orders',
          os_single:        'Work Order',
          os_new:           'New Order',
          os_number:        'Order #',
          document_main:    'Work Order',
          document_receipt: 'Receipt',
          document_budget:  'Quote',
          document_warranty:'Warranty',
          client_item:      'Device',
          client_items:     'Devices',
          item_field:       'Device',
          item_placeholder: 'e.g. iPhone 13 Pro, Samsung A52...',
          defect_field:     'Reported Issue',
          defect_placeholder:'e.g. Cracked screen, won\'t turn on...',
          diagnosis_field:  'Technical Diagnosis',
          staff_field:      'Assigned Technician',
          staff_plural:     'Technicians',
          service_field:    'Service',
          parts_field:      'Parts Used',
          warranty_field:   'Warranty (days)',
          extra_field_1:    'IMEI / Serial Number',
          extra_field_2:    'Device Password',
          extra_field_3:    'Accessories Received',
          kpi_primary:      'Open Orders',
          kpi_secondary:    'Completed Today',
          kpi_tertiary:     'Monthly Revenue',
          kpi_4th:          'Active Technicians',
        },
        es: {
          os_module:        'Órdenes de Trabajo',
          os_single:        'Orden de Trabajo',
          os_new:           'Nueva Orden',
          os_number:        'Nº Orden',
          document_main:    'Orden de Trabajo',
          document_receipt: 'Comprobante',
          document_budget:  'Presupuesto',
          document_warranty:'Garantía',
          client_item:      'Equipo',
          client_items:     'Equipos',
          item_field:       'Equipo',
          item_placeholder: 'Ej: iPhone 13 Pro, Samsung A52...',
          defect_field:     'Problema Reportado',
          defect_placeholder:'Ej: Pantalla rota, no enciende...',
          diagnosis_field:  'Diagnóstico Técnico',
          staff_field:      'Técnico Responsable',
          staff_plural:     'Técnicos',
          service_field:    'Servicio',
          parts_field:      'Repuestos',
          warranty_field:   'Garantía (días)',
          extra_field_1:    'IMEI / Nº de Serie',
          extra_field_2:    'Contraseña del Dispositivo',
          extra_field_3:    'Accesorios Entregados',
          kpi_primary:      'Órdenes Abiertas',
          kpi_secondary:    'Completadas Hoy',
          kpi_tertiary:     'Ingresos del Mes',
          kpi_4th:          'Técnicos Activos',
        }
      },

      // Campos do formulário OS (ordem de exibição)
      os_form_fields: [
        { id: 'client',    required: false, type: 'client_select' },
        { id: 'item',      required: true,  type: 'text',    label_key: 'item_field',     placeholder_key: 'item_placeholder' },
        { id: 'extra_1',   required: false, type: 'text',    label_key: 'extra_field_1' },
        { id: 'extra_2',   required: false, type: 'text',    label_key: 'extra_field_2' },
        { id: 'defect',    required: true,  type: 'textarea',label_key: 'defect_field',   placeholder_key: 'defect_placeholder', minimizable: true },
        { id: 'diagnosis', required: false, type: 'textarea',label_key: 'diagnosis_field', minimizable: true },
        { id: 'extra_3',   required: false, type: 'text',    label_key: 'extra_field_3' },
        { id: 'parts',     required: false, type: 'parts_list' },
        { id: 'technician',required: false, type: 'staff_select', label_key: 'staff_field' },
        { id: 'warranty',  required: false, type: 'number',  label_key: 'warranty_field', default: 90 },
        { id: 'priority',  required: false, type: 'priority_select' },
        { id: 'delivery',  required: false, type: 'date' },
        { id: 'payment',   required: false, type: 'payment_select' },
        { id: 'photos',    required: false, type: 'photo_upload',  config_key: 'photos_enabled' },
        { id: 'signature', required: false, type: 'signature_pad', config_key: 'signature_enabled' },
        { id: 'notes',     required: false, type: 'textarea' },
      ],

      // Documentos disponíveis
      documents: ['os', 'receipt', 'budget', 'warranty', 'contract'],

      // Status disponíveis para este segmento
      statuses: ['aguardando', 'andamento', 'concluido', 'retirada', 'cancelado', 'fiado', 'orcamento'],

      // KPIs padrão do dashboard
      default_kpis: ['open_os', 'revenue_month', 'profit', 'technicians'],
    },

    /* ── 2. LOJA / VAREJO ────────────────────────────────── */
    retail: {
      id: 'retail',
      accent_color: '#34D399',

      nav_icons: {
        dashboard:     'layout-dashboard',
        os:            'shopping-cart',
        clients:       'users',
        stock:         'package-2',
        cash:          'wallet',
        schedule:      'calendar-days',
        analytics:     'bar-chart-3',
        ai:            'sparkles',
        notifications: 'bell',
        settings:      'settings',
      },

      labels: {
        pt: {
          os_module:        'Vendas',
          os_single:        'Venda',
          os_new:           'Nova Venda',
          os_number:        'Nº Venda',
          document_main:    'Nota de Venda',
          document_receipt: 'Cupom Fiscal',
          document_budget:  'Orçamento',
          document_warranty:'Garantia',
          client_item:      'Produto',
          client_items:     'Produtos',
          item_field:       'Produto / Serviço',
          item_placeholder: 'Ex: Celular Samsung, Cabo USB...',
          defect_field:     'Observações da Venda',
          defect_placeholder:'Ex: Produto com defeito de fábrica...',
          diagnosis_field:  'Descrição Detalhada',
          staff_field:      'Vendedor',
          staff_plural:     'Vendedores',
          service_field:    'Produto / Serviço',
          parts_field:      'Itens da Venda',
          warranty_field:   'Garantia (dias)',
          extra_field_1:    'Código do Produto',
          extra_field_2:    'Número de Série',
          extra_field_3:    'Referência',
          kpi_primary:      'Vendas Hoje',
          kpi_secondary:    'Ticket Médio',
          kpi_tertiary:     'Faturamento do Mês',
          kpi_4th:          'Produtos Vendidos',
        },
        en: {
          os_module:        'Sales',
          os_single:        'Sale',
          os_new:           'New Sale',
          os_number:        'Sale #',
          document_main:    'Sales Receipt',
          document_receipt: 'Receipt',
          document_budget:  'Quote',
          document_warranty:'Warranty',
          client_item:      'Product',
          client_items:     'Products',
          item_field:       'Product / Service',
          item_placeholder: 'e.g. Samsung Phone, USB Cable...',
          defect_field:     'Sale Notes',
          defect_placeholder:'e.g. Factory defect...',
          diagnosis_field:  'Detailed Description',
          staff_field:      'Salesperson',
          staff_plural:     'Salespeople',
          service_field:    'Product / Service',
          parts_field:      'Sale Items',
          warranty_field:   'Warranty (days)',
          extra_field_1:    'Product Code',
          extra_field_2:    'Serial Number',
          extra_field_3:    'Reference',
          kpi_primary:      "Today's Sales",
          kpi_secondary:    'Average Ticket',
          kpi_tertiary:     'Monthly Revenue',
          kpi_4th:          'Items Sold',
        },
        es: {
          os_module:        'Ventas',
          os_single:        'Venta',
          os_new:           'Nueva Venta',
          os_number:        'Nº Venta',
          document_main:    'Nota de Venta',
          document_receipt: 'Comprobante',
          document_budget:  'Presupuesto',
          document_warranty:'Garantía',
          client_item:      'Producto',
          client_items:     'Productos',
          item_field:       'Producto / Servicio',
          item_placeholder: 'Ej: Celular Samsung, Cable USB...',
          defect_field:     'Observaciones',
          defect_placeholder:'Ej: Defecto de fábrica...',
          diagnosis_field:  'Descripción Detallada',
          staff_field:      'Vendedor',
          staff_plural:     'Vendedores',
          service_field:    'Producto / Servicio',
          parts_field:      'Ítems de la Venta',
          warranty_field:   'Garantía (días)',
          extra_field_1:    'Código del Producto',
          extra_field_2:    'Número de Serie',
          extra_field_3:    'Referencia',
          kpi_primary:      'Ventas Hoy',
          kpi_secondary:    'Ticket Promedio',
          kpi_tertiary:     'Ingresos del Mes',
          kpi_4th:          'Productos Vendidos',
        }
      },

      os_form_fields: [
        { id: 'client',    required: false, type: 'client_select' },
        { id: 'item',      required: true,  type: 'text',    label_key: 'item_field', placeholder_key: 'item_placeholder' },
        { id: 'extra_1',   required: false, type: 'text',    label_key: 'extra_field_1' },
        { id: 'extra_2',   required: false, type: 'text',    label_key: 'extra_field_2' },
        { id: 'parts',     required: true,  type: 'parts_list' },
        { id: 'technician',required: false, type: 'staff_select', label_key: 'staff_field' },
        { id: 'warranty',  required: false, type: 'number',  label_key: 'warranty_field', default: 30 },
        { id: 'payment',   required: true,  type: 'payment_select' },
        { id: 'photos',    required: false, type: 'photo_upload',  config_key: 'photos_enabled' },
        { id: 'notes',     required: false, type: 'textarea' },
      ],

      documents: ['receipt', 'budget', 'warranty'],
      statuses: ['andamento', 'concluido', 'cancelado', 'orcamento'],
      default_kpis: ['sales_today', 'revenue_month', 'avg_ticket', 'items_sold'],
    },

    /* ── 3. SALÃO DE BELEZA / ESTÉTICA ───────────────────── */
    beauty: {
      id: 'beauty',
      accent_color: '#F472B6',

      nav_icons: {
        dashboard:     'layout-dashboard',
        os:            'scissors',
        clients:       'users',
        stock:         'package',
        cash:          'wallet',
        schedule:      'calendar-days',
        analytics:     'bar-chart-3',
        ai:            'sparkles',
        notifications: 'bell',
        settings:      'settings',
      },

      labels: {
        pt: {
          os_module:        'Agendamentos',
          os_single:        'Agendamento',
          os_new:           'Novo Agendamento',
          os_number:        'Nº Atend.',
          document_main:    'Ficha de Atendimento',
          document_receipt: 'Comprovante',
          document_budget:  'Orçamento',
          document_warranty:'',
          client_item:      'Serviço',
          client_items:     'Serviços',
          item_field:       'Serviço Realizado',
          item_placeholder: 'Ex: Corte feminino, Escova, Manicure...',
          defect_field:     'Observações do Cliente',
          defect_placeholder:'Ex: Cabelo danificado, alergia a produtos...',
          diagnosis_field:  'Avaliação Técnica',
          staff_field:      'Profissional',
          staff_plural:     'Profissionais',
          service_field:    'Serviço',
          parts_field:      'Produtos Utilizados',
          warranty_field:   '',
          extra_field_1:    'Tipo de Cabelo / Pele',
          extra_field_2:    'Alergias / Restrições',
          extra_field_3:    'Próxima Visita',
          kpi_primary:      'Atendimentos Hoje',
          kpi_secondary:    'A Caminho',
          kpi_tertiary:     'Faturamento do Mês',
          kpi_4th:          'Profissionais Ativos',
        },
        en: {
          os_module:        'Appointments',
          os_single:        'Appointment',
          os_new:           'New Appointment',
          os_number:        'Appt. #',
          document_main:    'Service Record',
          document_receipt: 'Receipt',
          document_budget:  'Quote',
          document_warranty:'',
          client_item:      'Service',
          client_items:     'Services',
          item_field:       'Service Performed',
          item_placeholder: "e.g. Women's cut, Blowout, Manicure...",
          defect_field:     'Client Notes',
          defect_placeholder:'e.g. Damaged hair, product allergies...',
          diagnosis_field:  'Professional Assessment',
          staff_field:      'Professional',
          staff_plural:     'Professionals',
          service_field:    'Service',
          parts_field:      'Products Used',
          warranty_field:   '',
          extra_field_1:    'Hair / Skin Type',
          extra_field_2:    'Allergies / Restrictions',
          extra_field_3:    'Next Visit',
          kpi_primary:      "Today's Appointments",
          kpi_secondary:    'On the Way',
          kpi_tertiary:     'Monthly Revenue',
          kpi_4th:          'Active Professionals',
        },
        es: {
          os_module:        'Citas',
          os_single:        'Cita',
          os_new:           'Nueva Cita',
          os_number:        'Nº Atención',
          document_main:    'Ficha de Atención',
          document_receipt: 'Comprobante',
          document_budget:  'Presupuesto',
          document_warranty:'',
          client_item:      'Servicio',
          client_items:     'Servicios',
          item_field:       'Servicio Realizado',
          item_placeholder: 'Ej: Corte femenino, Brushing, Manicure...',
          defect_field:     'Observaciones del Cliente',
          defect_placeholder:'Ej: Cabello dañado, alergia a productos...',
          diagnosis_field:  'Evaluación Técnica',
          staff_field:      'Profesional',
          staff_plural:     'Profesionales',
          service_field:    'Servicio',
          parts_field:      'Productos Utilizados',
          warranty_field:   '',
          extra_field_1:    'Tipo de Cabello / Piel',
          extra_field_2:    'Alergias / Restricciones',
          extra_field_3:    'Próxima Visita',
          kpi_primary:      'Atenciones Hoy',
          kpi_secondary:    'En Camino',
          kpi_tertiary:     'Ingresos del Mes',
          kpi_4th:          'Profesionales Activos',
        }
      },

      os_form_fields: [
        { id: 'client',    required: true,  type: 'client_select' },
        { id: 'item',      required: true,  type: 'text',    label_key: 'item_field', placeholder_key: 'item_placeholder' },
        { id: 'extra_1',   required: false, type: 'text',    label_key: 'extra_field_1' },
        { id: 'extra_2',   required: false, type: 'text',    label_key: 'extra_field_2' },
        { id: 'defect',    required: false, type: 'textarea',label_key: 'defect_field', placeholder_key: 'defect_placeholder', minimizable: true },
        { id: 'diagnosis', required: false, type: 'textarea',label_key: 'diagnosis_field', minimizable: true },
        { id: 'parts',     required: false, type: 'parts_list' },
        { id: 'technician',required: true,  type: 'staff_select', label_key: 'staff_field' },
        { id: 'extra_3',   required: false, type: 'date',    label_key: 'extra_field_3' },
        { id: 'payment',   required: false, type: 'payment_select' },
        { id: 'photos',    required: false, type: 'photo_upload',  config_key: 'photos_enabled' },
        { id: 'signature', required: false, type: 'signature_pad', config_key: 'signature_enabled' },
        { id: 'notes',     required: false, type: 'textarea' },
      ],

      documents: ['os', 'receipt', 'budget'],
      statuses: ['aguardando', 'andamento', 'concluido', 'cancelado', 'orcamento'],
      default_kpis: ['appointments_today', 'revenue_month', 'avg_ticket', 'professionals'],
    },

    /* ── 4. OFICINA MECÂNICA ─────────────────────────────── */
    garage: {
      id: 'garage',
      accent_color: '#FB923C',

      nav_icons: {
        dashboard:     'layout-dashboard',
        os:            'wrench',
        clients:       'users',
        stock:         'package',
        cash:          'wallet',
        schedule:      'calendar-days',
        analytics:     'bar-chart-3',
        ai:            'sparkles',
        notifications: 'bell',
        settings:      'settings',
      },

      labels: {
        pt: {
          os_module:        'Ordens de Serviço',
          os_single:        'Ordem de Serviço',
          os_new:           'Nova OS',
          os_number:        'Nº OS',
          document_main:    'Ordem de Serviço',
          document_receipt: 'Comprovante',
          document_budget:  'Orçamento',
          document_warranty:'Garantia',
          client_item:      'Veículo',
          client_items:     'Veículos',
          item_field:       'Veículo',
          item_placeholder: 'Ex: Fiat Uno 2018, Honda Civic...',
          defect_field:     'Problema Relatado',
          defect_placeholder:'Ex: Barulho no motor, freio falhando...',
          diagnosis_field:  'Diagnóstico Mecânico',
          staff_field:      'Mecânico Responsável',
          staff_plural:     'Mecânicos',
          service_field:    'Serviço',
          parts_field:      'Peças Utilizadas',
          warranty_field:   'Garantia (km / dias)',
          extra_field_1:    'Placa do Veículo',
          extra_field_2:    'Quilometragem',
          extra_field_3:    'Ano / Cor',
          kpi_primary:      'OS Abertas',
          kpi_secondary:    'Concluídas Hoje',
          kpi_tertiary:     'Faturamento do Mês',
          kpi_4th:          'Mecânicos Ativos',
        },
        en: {
          os_module:        'Work Orders',
          os_single:        'Work Order',
          os_new:           'New Order',
          os_number:        'Order #',
          document_main:    'Work Order',
          document_receipt: 'Receipt',
          document_budget:  'Estimate',
          document_warranty:'Warranty',
          client_item:      'Vehicle',
          client_items:     'Vehicles',
          item_field:       'Vehicle',
          item_placeholder: 'e.g. Ford F-150 2020, Honda Civic...',
          defect_field:     'Reported Problem',
          defect_placeholder:'e.g. Engine noise, brake failure...',
          diagnosis_field:  'Mechanical Diagnosis',
          staff_field:      'Assigned Mechanic',
          staff_plural:     'Mechanics',
          service_field:    'Service',
          parts_field:      'Parts Used',
          warranty_field:   'Warranty (mi / days)',
          extra_field_1:    'License Plate',
          extra_field_2:    'Mileage',
          extra_field_3:    'Year / Color',
          kpi_primary:      'Open Orders',
          kpi_secondary:    'Completed Today',
          kpi_tertiary:     'Monthly Revenue',
          kpi_4th:          'Active Mechanics',
        },
        es: {
          os_module:        'Órdenes de Trabajo',
          os_single:        'Orden de Trabajo',
          os_new:           'Nueva Orden',
          os_number:        'Nº Orden',
          document_main:    'Orden de Trabajo',
          document_receipt: 'Comprobante',
          document_budget:  'Presupuesto',
          document_warranty:'Garantía',
          client_item:      'Vehículo',
          client_items:     'Vehículos',
          item_field:       'Vehículo',
          item_placeholder: 'Ej: Fiat Uno 2018, Honda Civic...',
          defect_field:     'Problema Reportado',
          defect_placeholder:'Ej: Ruido en motor, frenos fallando...',
          diagnosis_field:  'Diagnóstico Mecánico',
          staff_field:      'Mecánico Responsable',
          staff_plural:     'Mecánicos',
          service_field:    'Servicio',
          parts_field:      'Repuestos Utilizados',
          warranty_field:   'Garantía (km / días)',
          extra_field_1:    'Placa del Vehículo',
          extra_field_2:    'Kilometraje',
          extra_field_3:    'Año / Color',
          kpi_primary:      'Órdenes Abiertas',
          kpi_secondary:    'Completadas Hoy',
          kpi_tertiary:     'Ingresos del Mes',
          kpi_4th:          'Mecánicos Activos',
        }
      },

      os_form_fields: [
        { id: 'client',    required: false, type: 'client_select' },
        { id: 'item',      required: true,  type: 'text',    label_key: 'item_field', placeholder_key: 'item_placeholder' },
        { id: 'extra_1',   required: true,  type: 'text',    label_key: 'extra_field_1' },
        { id: 'extra_2',   required: false, type: 'text',    label_key: 'extra_field_2' },
        { id: 'extra_3',   required: false, type: 'text',    label_key: 'extra_field_3' },
        { id: 'defect',    required: true,  type: 'textarea',label_key: 'defect_field', placeholder_key: 'defect_placeholder', minimizable: true },
        { id: 'diagnosis', required: false, type: 'textarea',label_key: 'diagnosis_field', minimizable: true },
        { id: 'parts',     required: false, type: 'parts_list' },
        { id: 'technician',required: false, type: 'staff_select', label_key: 'staff_field' },
        { id: 'warranty',  required: false, type: 'text',    label_key: 'warranty_field' },
        { id: 'priority',  required: false, type: 'priority_select' },
        { id: 'delivery',  required: false, type: 'date' },
        { id: 'payment',   required: false, type: 'payment_select' },
        { id: 'photos',    required: false, type: 'photo_upload',  config_key: 'photos_enabled' },
        { id: 'signature', required: false, type: 'signature_pad', config_key: 'signature_enabled' },
        { id: 'notes',     required: false, type: 'textarea' },
      ],

      documents: ['os', 'receipt', 'budget', 'warranty', 'contract'],
      statuses: ['aguardando', 'andamento', 'concluido', 'retirada', 'cancelado', 'fiado', 'orcamento'],
      default_kpis: ['open_os', 'revenue_month', 'profit', 'mechanics'],
    }
  },

  // ── LISTA DE SEGMENTOS PARA O ONBOARDING ──────────────────
  list: [
    {
      id: 'tech',
      icon: 'cpu',
      color: '#38BDF8',
      labels: {
        pt: { name: 'Assistência Técnica', desc: 'Celulares, computadores, eletrônicos' },
        en: { name: 'Tech Repair Shop',    desc: 'Phones, computers, electronics' },
        es: { name: 'Servicio Técnico',    desc: 'Celulares, computadores, electrónicos' },
      }
    },
    {
      id: 'retail',
      icon: 'shopping-bag',
      color: '#34D399',
      labels: {
        pt: { name: 'Loja / Varejo',       desc: 'Vendas, PDV, controle de estoque' },
        en: { name: 'Retail Store',        desc: 'Sales, POS, inventory control' },
        es: { name: 'Tienda / Comercio',   desc: 'Ventas, PDV, control de inventario' },
      }
    },
    {
      id: 'beauty',
      icon: 'scissors',
      color: '#F472B6',
      labels: {
        pt: { name: 'Salão / Estética',    desc: 'Beleza, estética, barbearia' },
        en: { name: 'Beauty Salon',        desc: 'Beauty, aesthetics, barbershop' },
        es: { name: 'Salón de Belleza',    desc: 'Belleza, estética, barbería' },
      }
    },
    {
      id: 'garage',
      icon: 'wrench',
      color: '#FB923C',
      labels: {
        pt: { name: 'Oficina Mecânica',    desc: 'Carros, motos, veículos em geral' },
        en: { name: 'Auto Repair Shop',    desc: 'Cars, motorcycles, vehicles' },
        es: { name: 'Taller Mecánico',     desc: 'Autos, motos, vehículos en general' },
      }
    }
  ],

  // Retorna label do segmento no idioma atual
  getSegmentLabel(segId, field = 'name') {
    const seg = this.list.find(s => s.id === segId);
    if (!seg) return segId;
    const lang = I18N.lang;
    return seg.labels[lang]?.[field] || seg.labels['pt'][field];
  }
};
