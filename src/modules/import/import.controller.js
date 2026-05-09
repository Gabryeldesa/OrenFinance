const Papa = require('papaparse')
const { supabase } = require('../../lib/supabase')

// ─── Utilitários ──────────────────────────────────────────────────────────────
const stripQuotes = (str) => {
  if (!str) return str
  return str.toString().replace(/^"+|"+$/g, '').trim()
}

const parseMoney = (str) => {
  if (!str || str.toString().trim() === '') return 0
  const clean = stripQuotes(str)

  // Formato americano: -50.00 (ponto decimal, sem vírgula)
  if (/^-?\d+\.\d{2}$/.test(clean)) {
    const val = parseFloat(clean)
    return isNaN(val) ? 0 : Math.round(Math.abs(val) * 100)
  }

  // Formato brasileiro: -50,00 ou -1.234,56
  const br = clean.replace(/\./g, '').replace(',', '.')
  const val = parseFloat(br.replace(/[^0-9.-]/g, ''))
  return isNaN(val) ? 0 : Math.round(Math.abs(val) * 100)
}

const parseMoneyWithSign = (str) => {
  if (!str || str.toString().trim() === '') return { cents: 0, negative: false }
  const clean = stripQuotes(str)
  const negative = clean.startsWith('-')
  const cents = parseMoney(clean)
  return { cents, negative }
}

const parseDate = (str) => {
  if (!str) return null
  // Remove aspas que alguns CSVs incluem nos campos de data
  str = stripQuotes(str)
  if (!str) return null

  const parts = str.split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    if (d === '00' || m === '00') return null
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

const isJunkLine = (desc) => {
  if (!desc) return true
  const d = desc.toLowerCase().trim()
  return (
    d === '' ||
    /^saldo/i.test(d) ||
    /^s a l d o/i.test(d) ||
    /^filtro/i.test(d) ||
    /^os dados/i.test(d) ||
    /^últimos/i.test(d) ||
    /^nao ha/i.test(d) ||
    /^não há/i.test(d) ||
    /^total/i.test(d)
  )
}

// ─── Auto-categorização ───────────────────────────────────────────────────────
const CATEGORY_RULES = [
  { keywords: ['supercouto', 'assai', 'atacadao', 'carrefour', 'extra ', 'pao dourado', 'padaria', 'panificadora', 'mercado', 'supermercado', 'hortifruti', 'feira', 'ifood', 'rappi', 'restaurante', 'lanchonete', 'pizz', 'burger king', 'mcdonalds', 'outback', 'gelato', 'sorvete', 'cafe ', 'emporio', 'churrasco', 'peixaria', 'salgado', 'caldas', 'acai'], category: 'Alimentação' },
  { keywords: ['posto', 'combustivel', 'gasolina', 'etanol', 'uber', '99app', 'cabify', 'metro', 'onibus', 'estacionamento', 'parking', 'pedagio', 'detran', 'ipva', 'autoescola', 'concessionaria rota'], category: 'Transporte' },
  { keywords: ['claro', 'vivo', 'tim ', 'oi telecom', 'net ', 'internet', 'banda larga', 'telefone', 'celular', 'netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'youtube premium', 'globoplay', 'deezer', 'apple music', 'paramount', 'star+'], category: 'Assinaturas' },
  { keywords: ['farmacia', 'drogaria', 'droga', 'remedio', 'medico', 'clinica', 'hospital', 'laboratorio', 'plano de saude', 'unimed', 'hapvida', 'amil', 'dental', 'otica', 'psico'], category: 'Saúde' },
  { keywords: ['faculdade', 'escola', 'curso ', 'colegio', 'universidade', 'udemy', 'alura', 'coursera', 'unifan', 'senac'], category: 'Educação' },
  { keywords: ['aluguel', 'condominio', 'agua ', 'sabesp', 'saneago', 'energia', 'celg', 'enel', 'light ', 'cpfl', 'gas ', 'comgas', 'iptu', 'cartorio'], category: 'Moradia' },
  { keywords: ['loja ', 'moda ', 'roupa', 'calcado', 'tenis ', 'caedu', 'renner', 'riachuelo', 'marisa', 'c&a', 'hering', 'shopping', 'zara', 'farm ', 'arezzo', 'centauro'], category: 'Vestuário' },
  { keywords: ['tarifa', 'taxa bancaria', 'iof', 'juros', 'imposto', 'prefeitura', 'tributo', 'simples nacional', 'pref apda', 'pagamento de impostos'], category: 'Impostos' },
  { keywords: ['salario', 'salário', 'pagamento de salario', 'folha'], category: 'Salário' },
  { keywords: ['pix recebido', 'pix - recebido', 'transferencia recebida', 'ted recebida', 'rentabilidade', 'rendimento', 'dividendo', 'rentab.invest', 'resgate rdb', 'aplicacao rdb'], category: 'Outras receitas' },
  { keywords: ['pet shop', 'veterinario', 'racao', 'ração', 'cobasi', 'petz'], category: 'Pets' },
  { keywords: ['hotel', 'pousada', 'airbnb', 'passagem', 'voo', 'latam', 'gol ', 'azul ', 'decolar', 'booking'], category: 'Viagem' },
  { keywords: ['amazon', 'mercado livre', 'shopee', 'americanas', 'magazine luiza', 'magalu', 'casas bahia', 'kabum', 'aliexpress'], category: 'Tecnologia' },
]

const suggestCategory = (description, categories) => {
  const desc = (description || '').toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      const found = categories.find(c => c.name === rule.category)
      if (found) return { category_id: found.id, category_name: found.name }
    }
  }
  return { category_id: null, category_name: null }
}

// ─── Detecta banco ────────────────────────────────────────────────────────────
const detectBank = (content) => {
  const t = content.toLowerCase()
  if (t.includes('nubank') || t.includes('nu pagamentos') || t.includes('identificador')) return 'nubank'
  if (t.includes('banco inter') || t.includes('tipo lançamento') || t.includes('tipo lancamento')) return 'inter'
  if (t.includes('bradesco') || (t.includes('histórico') && t.includes('docto'))) return 'bradesco'
  if (t.includes('banco do brasil') || t.includes('bancodobrasil')) return 'bb'
  if (t.includes('itaú') || t.includes('itau')) return 'itau'
  if (t.includes('santander')) return 'santander'
  if (t.includes('caixa economica') || t.includes('caixa econômica')) return 'caixa'
  if (t.includes('c6 bank') || t.includes('c6bank')) return 'c6'
  if (t.includes('sicoob')) return 'sicoob'
  if (t.includes('sicredi')) return 'sicredi'
  return 'generic'
}

const bankLabel = (bank) => ({
  nubank: 'Nubank',
  inter: 'Inter',
  bradesco: 'Bradesco',
  bb: 'Banco do Brasil',
  itau: 'Itaú',
  santander: 'Santander',
  caixa: 'Caixa',
  c6: 'C6 Bank',
  sicoob: 'Sicoob',
  sicredi: 'Sicredi',
  generic: 'Desconhecido',
})[bank] || 'Desconhecido'

// ─── Parser Nubank ────────────────────────────────────────────────────────────
const parseNubank = (content) => {
  const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true })
  const transactions = []

  for (const row of parsed.data) {
    const dateRaw = row['Data'] || row['date'] || ''
    const valorRaw = row['Valor'] || row['valor'] || row['value'] || ''
    const desc = stripQuotes(
      row['Descrição'] || row['Descricao'] || row['DescriÃ§Ã£o'] || row['description'] || row['memo'] || ''
    )
    const docto = stripQuotes(row['Identificador'] || row['id'] || '')

    const date = parseDate(dateRaw)
    if (!date || !desc || isJunkLine(desc)) continue

    const { cents, negative } = parseMoneyWithSign(valorRaw)
    if (cents === 0) continue

    transactions.push({
      date,
      description: desc.substring(0, 255),
      amount_cents: cents,
      type: negative ? 'expense' : 'income',
      docto: docto.toString().trim()
    })
  }

  return transactions
}

// ─── Parser Inter ─────────────────────────────────────────────────────────────
const parseInter = (content) => {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const transactions = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const inner = (line.startsWith('"') && line.endsWith('"'))
      ? line.slice(1, -1)
      : line

    const normalized = inner.replace(/""/g, '\x00')
    const parts = normalized.split(',').map(p => p.replace(/\x00/g, '').trim())

    if (parts.length < 6) continue

    const dateRaw = parts[0]
    if (!dateRaw || dateRaw === '00/00/0000' || dateRaw.toLowerCase() === 'data') continue

    const date = parseDate(dateRaw)
    if (!date) continue

    const lancamento = stripQuotes(parts[1] || '')
    const detalhes = stripQuotes(parts[2] || '')
    const doc = stripQuotes(parts[3] || '')
    const tipo = parts[parts.length - 1].toLowerCase()

    const valorIntPart = parts[parts.length - 3] || ''
    const valorDecPart = parts[parts.length - 2] || ''
    const valorStr = `${valorIntPart},${valorDecPart}`

    if (isJunkLine(lancamento)) continue

    const desc = (detalhes.trim() || lancamento.trim())
    if (!desc || isJunkLine(desc)) continue

    const cents = parseMoney(valorStr)
    if (cents === 0) continue

    const isExpense = tipo.includes('saída') || tipo.includes('saida') || valorIntPart.startsWith('-')
    const cleanDesc = desc.replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/, '').trim()

    transactions.push({
      date,
      description: (cleanDesc || desc).substring(0, 255),
      amount_cents: cents,
      type: isExpense ? 'expense' : 'income',
      docto: doc.trim()
    })
  }

  return transactions
}

// ─── Parser Bradesco ──────────────────────────────────────────────────────────
const parseBradesco = (content) => {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const transactions = []

  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (/^data\s*;/i.test(lines[i].trim())) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) return transactions

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split(';')
    if (parts.length < 5) continue

    const dateRaw = stripQuotes(parts[0])
    const desc = stripQuotes(parts[1])
    const doc = stripQuotes(parts[2])
    const creditRaw = stripQuotes(parts[3])
    const debitRaw = stripQuotes(parts[4])

    const date = parseDate(dateRaw)
    if (!date || !desc || isJunkLine(desc)) continue

    const credit = parseMoney(creditRaw)
    const debit = parseMoney(debitRaw)

    if (credit === 0 && debit === 0) continue

    transactions.push({
      date,
      description: desc.substring(0, 255),
      amount_cents: credit > 0 ? credit : debit,
      type: credit > 0 ? 'income' : 'expense',
      docto: doc
    })
  }

  return transactions
}

// ─── Parser Genérico ──────────────────────────────────────────────────────────
const findCol = (headers, patterns) =>
  headers.find(h => patterns.some(p => h.toLowerCase().includes(p)))

const parseGeneric = (content) => {
  const firstLine = content.split('\n')[0] || ''
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','

  const lines = content.split('\n')
  let startLine = 0
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = lines[i].split(delimiter).filter(c => c.trim()).length
    if (cols >= 3) { startLine = i; break }
  }

  const parsed = Papa.parse(lines.slice(startLine).join('\n'), {
    header: true,
    skipEmptyLines: true,
    delimiter
  })

  const headers = parsed.meta.fields || []
  const dateCol = findCol(headers, ['data', 'date', 'dt '])
  const descCol = findCol(headers, ['histórico', 'historico', 'descrição', 'descricao', 'lançamento', 'lancamento', 'memo'])
  const valueCol = findCol(headers, ['valor', 'value', 'amount'])
  const creditCol = findCol(headers, ['crédito', 'credito', 'entrada', 'credit'])
  const debitCol = findCol(headers, ['débito', 'debito', 'saída', 'saida', 'debit'])
  const typeCol = findCol(headers, ['tipo', 'type', 'natureza'])
  const docCol = findCol(headers, ['doc', 'nro', 'identificador', 'id'])

  const transactions = []

  for (const row of parsed.data) {
    const date = parseDate(row[dateCol])
    if (!date) continue
    const desc = stripQuotes(row[descCol] || '').trim()
    if (!desc || isJunkLine(desc)) continue

    let amount_cents = 0
    let type = 'expense'

    if (creditCol && debitCol) {
      const credit = parseMoney(row[creditCol])
      const debit = parseMoney(row[debitCol])
      if (credit > 0) { amount_cents = credit; type = 'income' }
      else if (debit > 0) { amount_cents = debit; type = 'expense' }
      else continue
    } else if (valueCol) {
      const { cents, negative } = parseMoneyWithSign(row[valueCol])
      amount_cents = cents
      if (typeCol) {
        const t = (row[typeCol] || '').toLowerCase()
        type = (t.includes('créd') || t.includes('entrada') || t.includes('credit') || t.includes('income')) ? 'income' : 'expense'
      } else {
        type = negative ? 'expense' : 'income'
      }
    } else continue

    if (amount_cents === 0) continue

    transactions.push({
      date,
      description: desc.substring(0, 255),
      amount_cents,
      type,
      docto: docCol ? stripQuotes(row[docCol] || '').toString() : ''
    })
  }

  return transactions
}

// ─── Prepara conteúdo ─────────────────────────────────────────────────────────
const prepareContent = (buffer) => {
  // Remove BOM UTF-8 se existir
  let content = buffer.toString('utf-8').replace(/^\uFEFF/, '')

  // Só usa latin1 se realmente tiver caracteres corrompidos E não for Nubank
  const hasCorrupted = content.includes('\uFFFD')
  const looksLikeNubank = content.toLowerCase().includes('identificador') || content.toLowerCase().includes('nubank')

  if (hasCorrupted && !looksLikeNubank) {
    content = buffer.toString('latin1')
  }

  return content
}

// ─── Endpoint: preview ────────────────────────────────────────────────────────
const preview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'Nenhum arquivo enviado.' } })
    }

    const content = prepareContent(req.file.buffer)
    const bank = detectBank(content)
    const label = bankLabel(bank)

    let transactions = []

    if (bank === 'nubank') transactions = parseNubank(content)
    else if (bank === 'inter') transactions = parseInter(content)
    else if (bank === 'bradesco') transactions = parseBradesco(content)
    else transactions = parseGeneric(content)

    if (transactions.length === 0) {
      return res.status(422).json({
        error: { message: `Nenhuma transação encontrada. Banco detectado: ${label}.` }
      })
    }

    const userId = req.user.id
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .is('deleted_at', null)

    const duplicates = new Set()
    for (const tx of transactions) {
      if (!tx.docto) continue
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('date', tx.date)
        .eq('amount_cents', tx.amount_cents)
        .eq('import_docto', tx.docto)
        .is('deleted_at', null)
        .limit(1)
      if (existing && existing.length > 0) {
        duplicates.add(`${tx.date}-${tx.amount_cents}-${tx.docto}`)
      }
    }

    const result = transactions.map(tx => {
      const isDuplicate = duplicates.has(`${tx.date}-${tx.amount_cents}-${tx.docto}`)
      const suggestion = suggestCategory(tx.description, categories || [])
      return {
        ...tx,
        isDuplicate,
        selected: !isDuplicate,
        category_id: suggestion.category_id,
        category_name: suggestion.category_name
      }
    })

    return res.json({
      data: { bankLabel: label, total: result.length, duplicates: duplicates.size, transactions: result }
    })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// ─── Endpoint: confirm ────────────────────────────────────────────────────────
const confirm = async (req, res) => {
  try {
    const userId = req.user.id
    const { transactions, account_id } = req.body

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: { message: 'Nenhuma transação para importar.' } })
    }
    if (!account_id) {
      return res.status(400).json({ error: { message: 'Selecione uma conta.' } })
    }

    const toImport = transactions.filter(tx => tx.selected)
    if (toImport.length === 0) {
      return res.status(400).json({ error: { message: 'Nenhuma transação selecionada.' } })
    }

    const rows = toImport.map(tx => ({
      user_id: userId,
      account_id,
      category_id: tx.category_id || null,
      // Garante que data e descrição nunca cheguem com aspas residuais
      description: stripQuotes(tx.description || '').substring(0, 255),
      amount_cents: tx.amount_cents,
      type: tx.type,
      date: stripQuotes(tx.date || ''),
      is_confirmed: true,
      import_docto: tx.docto ? stripQuotes(tx.docto) : null,
      payment_method: tx.type === 'income' ? null : 'pix'
    }))

    // Validação final: rejeita qualquer linha com data inválida
    const invalid = rows.find(r => !r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
    if (invalid) {
      return res.status(400).json({
        error: { message: `Data inválida detectada: "${invalid.date}". Tente novamente.` }
      })
    }

    const { error } = await supabase.from('transactions').insert(rows)
    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.json({ data: { imported: rows.length } })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = { preview, confirm }