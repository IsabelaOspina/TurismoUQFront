import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

/** Servicios de la capa PL/SQL: reservas, liquidaciones, tarifas y auditoría de tarifas. */

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
  temporada: string;
  totalReservas: number;
  ingresos: number;
  pagado: number;
  saldoPendiente: number;
  fechaProceso: string;
}

/** Datos de una reserva existente (GET /api/reservas/{id}). */
export interface ReservaExistente {
  idReserva: number;
  idCliente: number;
  idHabitacion: number | null;
  fechaEntrada: string;
  fechaSalida: string;
  numeroPersonas: number;
  estado: string;
  valorTotal: number;
}

/** Una tarifa de una habitación en una temporada (un mes). */
export interface FilaTarifa {
  idHabitacion: number;
  idTemporada: number;
  temporada: string;
  mes: number;
  tipo: 'ALTA' | 'MEDIA' | 'BAJA' | string;
  precioNoche: number;
}

/** Un registro de AUDITORIA_TARIFA (lo llena el disparador trg_auditoria_tarifa). */
export interface FilaAuditoria {
  idAuditoria: number;
  usuario: string;
  fechaCambio: string;
  tipoOperacion: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  idHabitacion: number;
  idTemporada: number;
  valorAnterior: number | null;
  valorNuevo: number | null;
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
  'ORA-20003': 'Sin tarifa para esas fechas',
  'ORA-20004': 'Tarifas en conflicto',
  'ORA-20100': 'Fechas no válidas',
  'ORA-20101': 'Se supera la capacidad',
  'ORA-20102': 'Habitación no disponible',
  'ORA-20103': 'La habitación no existe',
  'ORA-20104': 'Número de personas no válido',
  'ORA-20110': 'La reserva no existe',
  'ORA-20111': 'La reserva no se puede editar',
  'ORA-20112': 'La reserva tiene pagos confirmados',
  'ORA-20113': 'Fechas no válidas',
  'ORA-20114': 'Número de personas no válido',
  'ORA-20115': 'La habitación no existe',
  'ORA-20116': 'Se supera la capacidad',
  'ORA-20117': 'Habitación no disponible',
  'ORA-20200': 'Habitación no disponible',
  'ORA-20300': 'Mes no válido',
  'ORA-20301': 'Año no válido',
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

  /** Consulta una reserva por su número, para precargar el formulario de edición. */
  obtenerReserva(idReserva: number): Observable<ReservaExistente> {
    return this.http.get<ReservaExistente>(`${API_URL}/reservas/${idReserva}`);
  }

  /** PKG_TURISMO_UQ.sp_editar_reserva */
  editarReserva(idReserva: number, datos: NuevaReserva): Observable<{ idReserva: number; mensaje: string }> {
    return this.http.put<{ idReserva: number; mensaje: string }>(`${API_URL}/reservas/editar/${idReserva}`, {
      idCliente: datos.idCliente,
      idHabitacion: datos.idHabitacion,
      fechaEntrada: datos.fechaIn,
      fechaSalida: datos.fechaOut,
      numeroPersonas: datos.numeroPersonas,
    });
  }

  /** Las 12 tarifas de una habitación. */
  listarTarifas(idHabitacion: number): Observable<FilaTarifa[]> {
    return this.http.get<FilaTarifa[]>(`${API_URL}/tarifas`, { params: new HttpParams().set('idHabitacion', idHabitacion) });
  }

  /** Cambia el precio de una tarifa (UPDATE de una fila; queda en la auditoría). */
  actualizarTarifa(idHabitacion: number, idTemporada: number, precioNoche: number, usuario: string): Observable<unknown> {
    return this.http.put(`${API_URL}/tarifas/${idHabitacion}/${idTemporada}`, { precioNoche, usuario });
  }

  /** Sube o baja un porcentaje todas las tarifas de la habitación con una sola sentencia UPDATE. */
  ajustarTarifas(idHabitacion: number, porcentaje: number, usuario: string): Observable<{ tarifasActualizadas: number }> {
    return this.http.put<{ tarifasActualizadas: number }>(`${API_URL}/tarifas/${idHabitacion}/ajuste`, { porcentaje, usuario });
  }

  /** Historial de AUDITORIA_TARIFA, del cambio más reciente al más antiguo. */
  listarAuditoria(): Observable<FilaAuditoria[]> {
    return this.http.get<FilaAuditoria[]>(`${API_URL}/auditoria-tarifas`);
  }

  /** Ejecuta PKG_TURISMO_UQ.sp_liquidacion_mensual y devuelve lo guardado. */
  generarLiquidacion(anio: number, mes: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.post<FilaLiquidacion[]>(`${API_URL}/liquidacion/generar`, {}, { params });
  }

  /** Ejecuta PKG_TURISMO_UQ.sp_liquidacion_temporada (año completo por temporada). */
  generarLiquidacionTemporada(anio: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio);
    return this.http.post<FilaLiquidacion[]>(`${API_URL}/liquidacion/temporada/generar`, {}, { params });
  }

  /** Lee LIQUIDACION_TEMPORADA sin volver a ejecutar el proceso. */
  consultarLiquidacionTemporada(anio: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio);
    return this.http.get<FilaLiquidacion[]>(`${API_URL}/liquidacion/temporada`, { params });
  }

  /** Lee LIQUIDACION_MENSUAL sin volver a ejecutar el proceso. */
  consultarLiquidacion(anio: number, mes: number): Observable<FilaLiquidacion[]> {
    const params = new HttpParams().set('anio', anio).set('mes', mes);
    return this.http.get<FilaLiquidacion[]>(`${API_URL}/liquidacion`, { params });
  }
}
