import {
  AccountResponse,
  MagisterAppointment,
  MagisterGradeResult,
  MagisterProfile,
  MagisterSubjectAverage,
  RawMagisterAppointment,
  StoredSession,
} from '../types/magister';
import { stripHtml } from '../lib/text';

const MAGISTER_API_BASE = 'https://ozhw.magister.net/api';

type UnknownRecord = Record<string, unknown>;

function getField(record: UnknownRecord | null | undefined, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function buildHeaders(session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  if (session.xsrfToken || session.accessToken) {
    headers['X-XSRF-TOKEN'] = session.xsrfToken ?? session.accessToken ?? '';
  }

  return headers;
}

async function magisterGet<T>(
  path: string,
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
): Promise<T> {
  const response = await fetch(`${MAGISTER_API_BASE}${path}`, {
    method: 'GET',
    headers: buildHeaders(session),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Magister reageert nu te vaak met 429. Wacht heel even en probeer daarna opnieuw.');
    }

    throw new Error(`Magister request faalde met status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function magisterGetFirstAvailable<T>(
  paths: string[],
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
): Promise<T> {
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      return await magisterGet<T>(path, session);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Onbekende Magister-fout.');

      if (!/status 404/.test(lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Geen bruikbaar Magister-endpoint gevonden.');
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function nestedRecord(record: UnknownRecord | null | undefined, ...keys: string[]) {
  return asRecord(getField(record, ...keys));
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed || null;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.'));

    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

function numericGradeValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatGradeValue(value: number, decimals = 1) {
  return value.toFixed(decimals).replace('.', ',');
}

function extractCollection(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidate = asRecord(payload);

  if (!candidate) {
    return [];
  }

  for (const key of keys) {
    const collection = candidate[key];

    if (Array.isArray(collection)) {
      return collection;
    }
  }

  return [];
}

function subjectFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');
  const vak = asRecord(row.Vak) ?? asRecord(row.vak) ?? nestedRecord(kolom, 'Vak', 'vak');

  return (
    stringValue(getField(vak, 'Omschrijving', 'omschrijving')) ??
    stringValue(getField(vak, 'Naam', 'naam')) ??
    stringValue(getField(vak, 'Code', 'code')) ??
    stringValue(getField(vak, 'Afkorting', 'afkorting')) ??
    stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving')) ??
    stringValue(getField(row, 'VakNaam', 'vakNaam')) ??
    stringValue(getField(row, 'VakCode', 'vakCode')) ??
    stringValue(getField(kolom, 'VakOmschrijving', 'vakOmschrijving', 'Naam', 'naam', 'Code', 'code')) ??
    'Onbekend vak'
  );
}

function titleFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'Omschrijving', 'omschrijving')) ??
    stringValue(getField(row, 'KolomKop', 'kolomKop')) ??
    stringValue(getField(row, 'Titel', 'titel')) ??
    stringValue(getField(row, 'Onderwerp', 'onderwerp')) ??
    stringValue(getField(kolom, 'Omschrijving', 'omschrijving', 'KolomKop', 'kolomKop', 'Naam', 'naam')) ??
    'Resultaat'
  );
}

function gradeFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'CijferStr', 'cijferStr')) ??
    stringValue(getField(row, 'Cijfer', 'cijfer')) ??
    stringValue(getField(row, 'ResultaatStr', 'resultaatStr')) ??
    stringValue(getField(row, 'Resultaat', 'resultaat')) ??
    stringValue(getField(row, 'Waarde', 'waarde')) ??
    stringValue(getField(kolom, 'Resultaat', 'resultaat', 'Waarde', 'waarde')) ??
    '-'
  );
}

function weightFromGradeRow(row: UnknownRecord) {
  const kolom =
    asRecord(getField(row, 'kolom', 'Kolom', 'CijferKolom', 'cijferKolom')) ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'Weging', 'weging')) ??
    stringValue(getField(row, 'Weegfactor', 'weegfactor')) ??
    stringValue(getField(kolom, 'Weging', 'weging', 'Weegfactor', 'weegfactor')) ??
    null
  );
}

function enteredAtFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'DatumIngevoerd', 'datumIngevoerd')) ??
    stringValue(getField(row, 'IngevoerdOp', 'ingevoerdOp')) ??
    stringValue(getField(row, 'Datum', 'datum')) ??
    stringValue(getField(row, 'DatumBehaald', 'datumBehaald')) ??
    stringValue(getField(row, 'AangemaaktOp', 'aangemaaktOp')) ??
    stringValue(getField(kolom, 'DatumIngevoerd', 'datumIngevoerd', 'Datum', 'datum')) ??
    null
  );
}

export function toProfile(account: AccountResponse): MagisterProfile {
  const id = account.Persoon?.Id;
  const firstName = account.Persoon?.Roepnaam?.trim() ?? 'Leerling';
  const infix = account.Persoon?.Tussenvoegsel?.trim() ?? '';
  const lastName = account.Persoon?.Achternaam?.trim() ?? '';

  if (!id) {
    throw new Error('Magister accountresponse bevat geen persoon-id.');
  }

  const fullName = [firstName, infix, lastName].filter(Boolean).join(' ').trim();

  return {
    id,
    personId: id,
    firstName,
    infix,
    lastName,
    fullName: fullName || firstName,
  };
}

function extractAppointments(payload: unknown): RawMagisterAppointment[] {
  return extractCollection(payload, ['Items', 'items', 'Afspraken']) as RawMagisterAppointment[];
}

function extractScheduleChanges(payload: unknown) {
  return extractCollection(payload, ['Items', 'items', 'Roosterwijzigingen', 'roosterwijzigingen'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item));
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function appointmentLikeSubject(row: UnknownRecord) {
  const vak = asRecord(getField(row, 'Vak', 'vak'));
  const vakken = getField(row, 'Vakken', 'vakken');

  if (Array.isArray(vakken)) {
    const values = vakken
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam', 'Code', 'code')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return values.join(', ');
    }
  }

  return (
    stringValue(getField(vak, 'Omschrijving', 'omschrijving', 'Naam', 'naam', 'Code', 'code')) ??
    stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving', 'VakNaam', 'vakNaam', 'VakCode', 'vakCode')) ??
    'Schoolafspraak'
  );
}

function appointmentLikeTeachers(row: UnknownRecord) {
  const docenten = getField(row, 'Docenten', 'docenten');

  if (Array.isArray(docenten)) {
    const values = docenten
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return values.join(', ');
    }
  }

  return stringValue(getField(row, 'Docent', 'docent', 'DocentNaam', 'docentNaam')) ?? 'Docent onbekend';
}

function appointmentLikeLocation(row: UnknownRecord) {
  const lokalen = getField(row, 'Lokalen', 'lokalen');

  if (Array.isArray(lokalen)) {
    const values = lokalen
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return values.join(', ');
    }
  }

  return stringValue(getField(row, 'Lokatie', 'lokatie', 'Lokaal', 'lokaal')) ?? 'Locatie volgt';
}

function rowChangeLooksCancelled(row: UnknownRecord) {
  const statusText = [
    stringValue(getField(row, 'StatusNaam', 'statusNaam')),
    stringValue(getField(row, 'OmschrijvingStatus', 'omschrijvingStatus')),
    stringValue(getField(row, 'Aantekening', 'aantekening')),
    stringValue(getField(row, 'Omschrijving', 'omschrijving')),
    stringValue(getField(row, 'Inhoud', 'inhoud')),
    appointmentLikeLocation(row),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const explicitFlag = getField(row, 'LesIsVervallen', 'lesIsVervallen', 'Vervallen', 'vervallen', 'IsVervallen', 'isVervallen');
  const locationText = normalizeText(appointmentLikeLocation(row));

  return (
    explicitFlag === true ||
    /\b(vervallen|uitgevallen|uitval|afgelast|geannuleerd|cancelled|canceled)\b/.test(statusText) ||
    /^lokaal\s+\S+/.test(locationText)
  );
}

function rowChangeKeys(row: UnknownRecord) {
  const id = stringValue(getField(row, 'AfspraakId', 'afspraakId', 'Id', 'id'));
  const start = stringValue(getField(row, 'Start', 'start', 'Van', 'van', 'Begin', 'begin'));
  const end = stringValue(getField(row, 'Einde', 'einde', 'Tot', 'tot', 'Eind', 'eind'));
  const lessonHour = stringValue(getField(row, 'LesuurVan', 'lesuurVan', 'Lesuur', 'lesuur'));
  const subject = appointmentLikeSubject(row);
  const normalizedSubject = normalizeText(subject);
  const keys = new Set<string>();

  if (id) {
    keys.add(`id:${id}`);
  }

  if (start && end) {
    keys.add(`time:${start}|${end}`);

    if (lessonHour) {
      keys.add(`time-hour:${start}|${end}|${lessonHour}`);
    }

    if (normalizedSubject) {
      keys.add(`time-subject:${start}|${end}|${normalizedSubject}`);
    }
  }

  return Array.from(keys);
}

function appointmentKeys(appointment: MagisterAppointment) {
  const keys = new Set<string>();
  const normalizedSubject = normalizeText(appointment.subject);

  keys.add(`id:${appointment.id}`);
  keys.add(`time:${appointment.start}|${appointment.end}`);

  if (appointment.lessonHour != null) {
    keys.add(`time-hour:${appointment.start}|${appointment.end}|${String(appointment.lessonHour)}`);
  }

  if (normalizedSubject) {
    keys.add(`time-subject:${appointment.start}|${appointment.end}|${normalizedSubject}`);
  }

  return Array.from(keys);
}

function appointmentFromScheduleChange(row: UnknownRecord): MagisterAppointment | null {
  if (!rowChangeLooksCancelled(row)) {
    return null;
  }

  const start = stringValue(getField(row, 'Start', 'start', 'Van', 'van', 'Begin', 'begin'));
  const end = stringValue(getField(row, 'Einde', 'einde', 'Tot', 'tot', 'Eind', 'eind'));

  if (!start || !end) {
    return null;
  }

  const subject = appointmentLikeSubject(row);
  const lessonHourValue = numberValue(getField(row, 'LesuurVan', 'lesuurVan', 'Lesuur', 'lesuur'));
  const lessonHourEndValue = numberValue(getField(row, 'LesuurTotMet', 'lesuurTotMet', 'Lesuur', 'lesuur'));
  const lessonHours =
    lessonHourValue != null && lessonHourEndValue != null && lessonHourValue !== lessonHourEndValue
      ? `${lessonHourValue}/${lessonHourEndValue}`
      : lessonHourValue != null
        ? String(lessonHourValue)
        : null;

  return {
    id: stringValue(getField(row, 'AfspraakId', 'afspraakId', 'Id', 'id')) ?? `${start}-${end}-${subject}`,
    title: stringValue(getField(row, 'Omschrijving', 'omschrijving')) ?? subject,
    subject,
    start,
    end,
    location: '-',
    teachers: appointmentLikeTeachers(row),
    lessonHour: lessonHourValue,
    lessonHourEnd: lessonHourEndValue ?? lessonHourValue,
    lessonHours,
    isAllDay: false,
    description: stringValue(getField(row, 'Inhoud', 'inhoud', 'Aantekening', 'aantekening')) ?? undefined,
    infoType: numberValue(getField(row, 'InfoType', 'infoType')),
    hasAttachments: false,
    isCancelled: true,
  };
}

function applyScheduleChanges(
  appointments: MagisterAppointment[],
  changePayload?: unknown,
) {
  const changes = extractScheduleChanges(changePayload).filter(rowChangeLooksCancelled);

  if (changes.length === 0) {
    return appointments;
  }

  const cancellationKeys = new Set<string>();
  const syntheticAppointments: MagisterAppointment[] = [];

  changes.forEach((change) => {
    rowChangeKeys(change).forEach((key) => cancellationKeys.add(key));

    const syntheticAppointment = appointmentFromScheduleChange(change);

    if (syntheticAppointment) {
      syntheticAppointments.push(syntheticAppointment);
    }
  });

  const updatedAppointments = appointments.map((appointment) => {
    const isCancelled =
      appointment.isCancelled ||
      appointmentKeys(appointment).some((key) => cancellationKeys.has(key));

    if (!isCancelled) {
      return appointment;
    }

    return {
      ...appointment,
      isCancelled: true,
      location: '-',
    };
  });

  const seenKeys = new Set(updatedAppointments.flatMap(appointmentKeys));
  const extraCancelledAppointments = syntheticAppointments.filter((appointment) =>
    !appointmentKeys(appointment).some((key) => seenKeys.has(key)),
  );

  return [...updatedAppointments, ...extraCancelledAppointments].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
}

function withUniqueIds<T extends { id: string }>(items: T[]) {
  const seenIds = new Map<string, number>();

  return items.map((item) => {
    const currentCount = seenIds.get(item.id) ?? 0;
    seenIds.set(item.id, currentCount + 1);

    if (currentCount === 0) {
      return item;
    }

    return {
      ...item,
      id: `${item.id}-${currentCount + 1}`,
    };
  });
}

export function normalizeAppointments(payload: unknown, changePayload?: unknown): MagisterAppointment[] {
  const normalizedAppointments = extractAppointments(payload)
    .filter((appointment) => appointment.Start && appointment.Einde)
    .map((appointment) => {
      const statusText = [
        appointment.StatusNaam,
        appointment.OmschrijvingStatus,
        appointment.Aantekening,
        appointment.Omschrijving,
        appointment.Inhoud,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const subject =
        appointment.Vakken?.map((item) => item.Naam || item.Code).filter(Boolean).join(', ') ||
        'Schoolafspraak';

      const location =
        appointment.Lokalen?.map((item) => item.Naam).filter(Boolean).join(', ') ||
        appointment.Lokatie ||
        'Locatie volgt';

      const teachers =
        appointment.Docenten?.map((item) => item.Naam).filter(Boolean).join(', ') || 'Docent onbekend';

      const lessonHour = appointment.LesuurVan ?? null;
      const lessonHours =
        appointment.LesuurVan && appointment.LesuurTotMet && appointment.LesuurVan !== appointment.LesuurTotMet
          ? `${appointment.LesuurVan}-${appointment.LesuurTotMet}`
          : appointment.LesuurVan
            ? String(appointment.LesuurVan)
            : null;

      return {
        id: String(appointment.Id ?? `${appointment.Start}-${appointment.Einde}`),
        title: appointment.Omschrijving?.trim() || subject,
        subject,
        start: appointment.Start ?? '',
        end: appointment.Einde ?? '',
        location,
        teachers,
        lessonHour,
        lessonHourEnd: appointment.LesuurTotMet ?? appointment.LesuurVan ?? null,
        lessonHours,
        isAllDay: appointment.DuurtHeleDag ?? false,
        description: appointment.Inhoud ? stripHtml(appointment.Inhoud) : undefined,
        infoType: appointment.InfoType ?? null,
        hasAttachments: appointment.HeeftBijlagen ?? false,
        isCancelled:
          appointment.LesIsVervallen === true ||
          /\b(vervallen|uitgevallen|uitval|afgelast|geannuleerd|cancelled|canceled)\b/.test(statusText),
      };
    })
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  return applyScheduleChanges(normalizedAppointments, changePayload);
}

export function normalizeGradeResults(payload: unknown): MagisterGradeResult[] {
  const results = extractCollection(payload, ['Items', 'items', 'Resultaten', 'resultaten'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const enteredAt = enteredAtFromGradeRow(row);

      return {
        id:
          stringValue(getField(row, 'Id', 'id')) ??
          stringValue(getField(row, 'CijferKolomId', 'cijferKolomId')) ??
          `${subjectFromGradeRow(row)}-${titleFromGradeRow(row)}-${enteredAt ?? gradeFromGradeRow(row)}`,
        subject: subjectFromGradeRow(row),
        title: titleFromGradeRow(row),
        grade: gradeFromGradeRow(row),
        weight: weightFromGradeRow(row),
        enteredAt,
      };
    })
    .sort((left, right) => {
      const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
      const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;

      return rightTime - leftTime;
    });

  return withUniqueIds(results);
}

export function normalizeSubjectAverages(payload: unknown): MagisterSubjectAverage[] {
  const averages = extractCollection(payload, ['Items', 'items', 'Gemiddelden', 'gemiddelden'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const vak = asRecord(row.Vak) ?? asRecord(row.vak);
      const subject =
        stringValue(getField(vak, 'Omschrijving', 'omschrijving')) ??
        stringValue(getField(vak, 'Naam', 'naam')) ??
        stringValue(getField(vak, 'Code', 'code')) ??
        stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving')) ??
        stringValue(getField(row, 'VakNaam', 'vakNaam')) ??
        'Onbekend vak';

      const roundedAverage =
        stringValue(getField(row, 'AfgerondGemiddelde', 'afgerondGemiddelde')) ??
        stringValue(getField(row, 'Afgerond', 'afgerond')) ??
        stringValue(getField(row, 'GemiddeldeKolom', 'gemiddeldeKolom')) ??
        null;

      const average =
        roundedAverage ??
        stringValue(getField(row, 'Gemiddelde', 'gemiddelde')) ??
        stringValue(getField(row, 'GemiddeldeStr', 'gemiddeldeStr')) ??
        stringValue(getField(row, 'Cijfer', 'cijfer')) ??
        (numberValue(getField(row, 'Gemiddelde', 'gemiddelde')) != null
          ? String(numberValue(getField(row, 'Gemiddelde', 'gemiddelde')))
          : '-');

      return {
        id: stringValue(getField(row, 'Id', 'id')) ?? `${subject}-${average}`,
        subject,
        average,
        roundedAverage,
        exactAverage: average,
        gradeCount: 0,
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject, 'nl-NL'));

  return withUniqueIds(averages);
}

export function calculateSubjectAveragesFromGrades(grades: MagisterGradeResult[]): MagisterSubjectAverage[] {
  const grouped = new Map<string, { weightedTotal: number; weightTotal: number; gradeCount: number }>();

  grades.forEach((grade) => {
    const numericGrade = numericGradeValue(grade.grade);

    if (numericGrade == null) {
      return;
    }

    const numericWeight = numericGradeValue(grade.weight) ?? 1;

    if (numericWeight <= 0) {
      return;
    }

    const current = grouped.get(grade.subject) ?? { weightedTotal: 0, weightTotal: 0, gradeCount: 0 };
    current.weightedTotal += numericGrade * numericWeight;
    current.weightTotal += numericWeight;
    current.gradeCount += 1;
    grouped.set(grade.subject, current);
  });

  return Array.from(grouped.entries())
    .map(([subject, values]) => {
      const exactAverage = values.weightedTotal / values.weightTotal;

      return {
        id: `${subject}-${values.weightTotal}`,
        subject,
        average: formatGradeValue(exactAverage, 1),
        roundedAverage: String(Math.round(exactAverage)).replace('.', ','),
        exactAverage: formatGradeValue(exactAverage, 2),
        gradeCount: values.gradeCount,
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject, 'nl-NL'));
}

export async function fetchAccountFromTokens(session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>) {
  return magisterGet<AccountResponse>('/account', session);
}

export async function fetchScheduleFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  from: string,
  to: string,
) {
  return magisterGet<unknown>(`/personen/${personId}/afspraken?van=${from}&tot=${to}`, session);
}

export async function fetchScheduleChangesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  from: string,
  to: string,
) {
  return magisterGet<unknown>(`/personen/${personId}/roosterwijzigingen?van=${from}&tot=${to}`, session);
}

export async function fetchLatestGradesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGetFirstAvailable<unknown>(
    [
      `/personen/${personId}/cijfers/laatste?top=100&skip=0`,
      `/personen/${personId}/cijfers/laatste`,
      `/personen/${personId}/resultaten/laatste?top=100&skip=0`,
    ],
    session,
  );

  return normalizeGradeResults(payload);
}

export async function fetchSubjectAveragesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGetFirstAvailable<unknown>(
    [
      `/personen/${personId}/cijfers/gemiddelden`,
      `/personen/${personId}/cijfers/gemiddeldenvoorexamen`,
      `/personen/${personId}/resultaten/gemiddelden`,
    ],
    session,
  );

  return normalizeSubjectAverages(payload);
}
