// Formateo de valores segun rep.ReporteColumna.Formato (locale es-VE).
const nf = (min, max) => new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: min, maximumFractionDigits: max
});

/**
 * Formatea un valor segun el formato de la columna.
 * @param {*} valor
 * @param {string} formato  TEXTO|ENTERO|NUMERO|MONEDA|FECHA|PORCENTAJE
 * @param {string} [patron] rep.ReporteColumna.FormatoPatron:
 *   - MONEDA: simbolo a anteponer (ej. 'Bs', '$'); por defecto sin simbolo.
 *   - FECHA: si contiene 'HH' se muestra tambien la hora.
 *   - Numericos: '#,##0' o '#,##0.000' fija los decimales por el numero de ceros.
 */
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
      return /HH|hh/.test(patron || '')
        ? d.toLocaleString('es-VE')
        : d.toLocaleDateString('es-VE');
    }
    default: return String(valor);
  }
}

/** Cuenta los decimales declarados en un patron tipo '#,##0.00'. */
function decimalesDe(patron) {
  if (!patron) return null;
  const m = /[.,](0+)\s*$/.exec(patron.trim());
  return m ? m[1].length : null;
}

const ES_NUMERICO = new Set(['ENTERO', 'NUMERO', 'MONEDA', 'PORCENTAJE']);
export const esNumerico = (formato) => ES_NUMERICO.has(formato);

/** Calcula la metrica de pie de una columna sobre las filas visibles. */
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
