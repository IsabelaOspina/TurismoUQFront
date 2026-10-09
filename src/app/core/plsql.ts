import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

/** Servicios de la entrega 2 (capa PL/SQL): reservas y liquidación mensual. */

export interface NuevaReserva {
  idCliente: number | null;
  idHabitacion: number | null;
  fechaIn: string;
  fechaOut: string;
  numeroPersonas: number | null;
}

export interface FilaLiquidacion {
  alojamiento: string;
  municipio: string;
  totalReservas: number;
  ingresos: number;
  pagado: number;
  saldoPendiente: number;
  fechaProceso: string;
}

export interface ErrorPlsql {
  codigo: string;   // "ORA-20102"
  titulo: string;   // "Habitación no disponible"
  mensaje: string;  // texto que envía Oracle
}

/** Errores propios definidos con RAISE_APPLICATION_ERROR en el paquete y los disparadores. */
const TITULOS: Record<string, string> = {
  'ORA-20001': 'Faltan las fechas',
  'ORA-20002': 'Fechas no válidas',
  'ORA-20003': 'La habitación no existe',
  'ORA-20004': 'Tarifas en conflicto',
  'ORA-20100': 'Fechas no válidas',
  'ORA-20101': 'Se supera la capacidad',
  'ORA-20102': 'Habitación no disponible',
  'ORA-20103': 'La habitación no existe',
  'ORA-20104': 'Número de personas no válido',
  'ORA-20200': 'Habitación no disponible',
  'ORA-20300': 'Mes no válido',
  'ORA-02291': 'Cliente o habitación inexistente',
};

/** Convierte la respuesta de error del backend en código + título + mensaje. */
export function leerErrorPlsql(err: HttpErrorResponse): ErrorPlsql {
  if (err.status === 0) {
    return {
      codigo: '',
      titulo: 'Sin conexión con el servidor',
      mensaje: 'Verifica que el backend esté corriendo en el puerto 8080.',
    };
  }
  const texto: string = err.error?.error ?? `El servidor respondió con un error (${err.status}).`;
  const encontrado = texto.match(/(ORA-\d{5}):\s*(.*)/);
  if (!encontrado) {
    return { codigo: `HTTP ${err.status}`, titulo: 'No se pudo completar la operación', mensaje: texto };
  }
  const [, codigo, mensaje] = encontrado;
  return { codigo, titulo: TITULOS[codigo] ?? 'No se pudo completar la operación', mensaje };
}

@Injectable({ providedIn: 'root' })
export class PlsqlService {
  private http = inject(HttpClient);

  /** PKG_TURISMO_UQ.fn_valor_estadia */
  valorEstadia(idHabitacion: number, fechaIn: string, fechaOut: string): Observable<{ valor: number }> {
    const params = new HttpParams()
      .set('idHabitacion', idHabitacion)
      .set('fechaIn', fechaIn)
      .set('fechaOut', fechaOut);
    return this.http.get<{ valor: number }>(`${API_URL}/reservas/valor-estadia`, { params });
  }

  /** PKG_TURISMO_UQ.sp_crear_reserva */
  crearReserva(datos: NuevaReserva): Observable<{ idReserva: number; mensaje: string }> {
    return this.http.post<{ idReserva: number; mensaje: string }>(`${API_URL}/reservas/crear`, datos);
  }

  /** Ejecuta PKG_TURISMO_UQ.sp_liquidacion_mensual y devuelve lo guardado. */
  generarLiquidacion(anio: number, mes: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.post<FilaLiquidacion[]>(`${API_URL}/liquidacion/generar`, {}, { params });
  }

  /** Lee LIQUIDACION_MENSUAL sin volver a ejecutar el proceso. */
  consultarLiquidacion(anio: number, mes: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.get<FilaLiquidacion[]>(`${API_URL}/liquidacion`, { params });
  }
}
