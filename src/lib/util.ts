import sitio from '../data/sitio.json';

export const wa = (mensaje: string, numero: string = sitio.whatsapp) =>
  `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;

export const precio = (n: number) => '$' + n.toLocaleString('es-CL');

const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const fechaPartes = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return { dia: String(d).padStart(2, '0'), mes: meses[m - 1], semana: dias[f.getDay()] };
};
