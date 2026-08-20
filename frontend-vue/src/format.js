const nf = (min, max) => new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: min, maximumFractionDigits: max
});

function aplicarPatronFecha(d, patron) {
  const pad = n => String(n).padStart(2, '0');
  return patron
    .replace('yyyy', d.getFullYear())
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('dd',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()));
}

export function formatValue(valor, formato, patron) {
  if (valor === null || valor === undefined || valor === '') return '';
  const dec = decimalesDe(patron);
  switch (formato) {
    case 'ENTERO':     return nf(dec ?? 0, dec ?? 0).format(Number(valor));
    case 'NUMERO':     return nf(dec ?? 2, dec ?? 2).format(Number(valor));
    case 'MONEDA': {
      const n = nf(dec ?? 2, dec ?? 2).format(Number(valor));
      const simbolo = (patron || '').replace(/[#0.,\s]/g, '');
      return simbolo ? `${simbolo} ${n}` : n;
    }
    case 'PORCENTAJE': return nf(dec ?? 2, dec ?? 2).format(Number(valor)) + ' %';
    case 'FECHA': {
      const d = new Date(valor);
      if (isNaN(d)) return String(valor);
      return aplicarPatronFecha(d, patron || 'dd/MM/yyyy HH:mm');
    }
    default: {
      const s = String(valor);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return aplicarPatronFecha(d, patron || 'dd/MM/yyyy HH:mm');
      }
      return s;
    }
  }
}

function decimalesDe(patron) {
  if (!patron) return null;
  const m = /[.,](0+)\s*$/.exec(patron.trim());
  return m ? m[1].length : null;
}

const ES_NUMERICO = new Set(['ENTERO', 'NUMERO', 'MONEDA', 'PORCENTAJE']);
export const esNumerico = (formato) => ES_NUMERICO.has(formato);

export function calcularAgregacion(rows, campo, tipo) {
  if (!tipo || tipo === 'NINGUNA') return null;
  const nums = rows.map(r => Number(r[campo])).filter(n => !isNaN(n));
  switch (tipo) {
    case 'SUMA':     return nums.reduce((a, b) => a + b, 0);
    case 'PROMEDIO': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'CONTEO':   return rows.length;
    case 'MIN':      return nums.length ? Math.min(...nums) : null;
    case 'MAX':      return nums.length ? Math.max(...nums) : null;
    default: return null;
  }
}
