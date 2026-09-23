import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

export type TipoColumna = 'texto' | 'numero' | 'dinero' | 'fecha' | 'porcentaje' | 'ranking' | 'estado';

export interface Columna {
  campo: string;
  titulo: string;
  tipo: TipoColumna;
}

export interface Reporte {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string;
  endpoint: string;
  columnas: Columna[];
  /** Consulta 5: necesita rango de fechas. */
  conFechas?: boolean;
  /** Consulta 6: permite refrescar la vista materializada. */
  refrescable?: boolean;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const REPORTES: Reporte[] = [
  {
    id: 'ocupacion-mensual',
    numero: 1,
    titulo: 'Ocupación por municipio y mes',
    descripcion: 'Reservas confirmadas o finalizadas de cada municipio, distribuidas por mes de entrada.',
    endpoint: 'ocupacion-mensual',
    columnas: [
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      ...MESES.map((m) => ({ campo: m.toLowerCase(), titulo: m, tipo: 'numero' as TipoColumna })),
    ],
  },
  {
    id: 'ingresos',
    numero: 2,
    titulo: 'Ingresos por municipio, tipo y temporada',
    descripcion: 'Ingresos totales con subtotales por municipio, tipo de alojamiento y temporada.',
    endpoint: 'ingresos',
    columnas: [
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'tipoAlojamiento', titulo: 'Tipo de alojamiento', tipo: 'texto' },
      { campo: 'temporada', titulo: 'Temporada', tipo: 'texto' },
      { campo: 'ingresosTotales', titulo: 'Ingresos totales', tipo: 'dinero' },
    ],
  },
  {
    id: 'top-alojamientos',
    numero: 3,
    titulo: 'Top 3 alojamientos por municipio',
    descripcion: 'Los tres alojamientos que más ingresos generan en cada municipio.',
    endpoint: 'top-alojamientos',
    columnas: [
      { campo: 'ranking', titulo: 'Puesto', tipo: 'ranking' },
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'alojamiento', titulo: 'Alojamiento', tipo: 'texto' },
      { campo: 'ingresos', titulo: 'Ingresos', tipo: 'dinero' },
    ],
  },
  {
    id: 'variacion-mensual',
    numero: 4,
    titulo: 'Variación de ingresos mes a mes',
    descripcion: 'Compara los ingresos de cada mes con los del mes anterior.',
    endpoint: 'variacion-mensual',
    columnas: [
      { campo: 'mes', titulo: 'Mes', tipo: 'texto' },
      { campo: 'ingresos', titulo: 'Ingresos', tipo: 'dinero' },
      { campo: 'ingresosMesAnterior', titulo: 'Mes anterior', tipo: 'dinero' },
      { campo: 'variacion', titulo: 'Variación', tipo: 'dinero' },
      { campo: 'variacionPorcentaje', titulo: 'Variación %', tipo: 'porcentaje' },
    ],
  },
  {
    id: 'reservas',
    numero: 5,
    titulo: 'Reservas por rango de fechas',
    descripcion: 'Detalle de las reservas cuya fecha de entrada está dentro del rango elegido.',
    endpoint: 'reservas',
    conFechas: true,
    columnas: [
      { campo: 'idReserva', titulo: 'Reserva', tipo: 'texto' },
      { campo: 'fechaEntrada', titulo: 'Entrada', tipo: 'fecha' },
      { campo: 'fechaSalida', titulo: 'Salida', tipo: 'fecha' },
      { campo: 'cliente', titulo: 'Cliente', tipo: 'texto' },
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'estado', titulo: 'Estado', tipo: 'estado' },
      { campo: 'valorTotal', titulo: 'Valor total', tipo: 'dinero' },
    ],
  },
  {
    id: 'ocupacion-mensual-mv',
    numero: 6,
    titulo: 'Ocupación mensual (vista materializada)',
    descripcion: 'Reservas e ingresos por mes y municipio leídos desde mv_ocupacion_mensual.',
    endpoint: 'ocupacion-mensual-mv',
    refrescable: true,
    columnas: [
      { campo: 'mes', titulo: 'Mes', tipo: 'texto' },
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'totalReservas', titulo: 'Reservas', tipo: 'numero' },
      { campo: 'ingresosTotales', titulo: 'Ingresos totales', tipo: 'dinero' },
    ],
  },
  {
    id: 'reservas-trimestre',
    numero: 7,
    titulo: 'Reservas por trimestre',
    descripcion: 'Total de reservas de cada municipio por trimestre del año.',
    endpoint: 'reservas-trimestre',
    columnas: [
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'trimestre', titulo: 'Trimestre', tipo: 'texto' },
      { campo: 'totalReservas', titulo: 'Reservas', tipo: 'numero' },
    ],
  },
  {
    id: 'mejores-alojamientos',
    numero: 8,
    titulo: 'Mejores alojamientos por calificación',
    descripcion: 'Promedio de calificación de los alojamientos con al menos 3 reseñas.',
    endpoint: 'mejores-alojamientos',
    columnas: [
      { campo: 'alojamiento', titulo: 'Alojamiento', tipo: 'texto' },
      { campo: 'municipio', titulo: 'Municipio', tipo: 'texto' },
      { campo: 'calificacionPromedio', titulo: 'Calificación', tipo: 'numero' },
      { campo: 'totalResenas', titulo: 'Reseñas', tipo: 'numero' },
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);

  consultar(reporte: Reporte, fechaInicio?: string, fechaFin?: string): Observable<Record<string, unknown>[]> {
    let params = new HttpParams();
    if (reporte.conFechas && fechaInicio && fechaFin) {
      params = params.set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    }
    return this.http.get<Record<string, unknown>[]>(`${API_URL}/reportes/${reporte.endpoint}`, { params });
  }

  refrescarVistaMaterializada(): Observable<void> {
    return this.http.post<void>(`${API_URL}/reportes/ocupacion-mensualv/refrescar`, {});
  }
}
