// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the state shown on the device, the "Test the
// decoders" report, command errors. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks every
// table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './decoder/client.js';

/** The text of a multi-language object, English when the language is missing. */
export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

/** "Living room: does not answer", with the typography of each language. */
export const labelled = (name, text, language) =>
  language === 'fr' ? `${name} : ${text}` : `${name}: ${text}`;

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noDecoder: {
    en: 'Enter the IP address of your decoder in the configuration.',
    fr: "Saisissez l'adresse IP de votre décodeur dans la configuration.",
    de: 'Gib die IP-Adresse deines Decoders in der Konfiguration ein.',
    es: 'Introduzca la dirección IP de su decodificador en la configuración.',
  },
  invalidAddress: {
    en: 'Address not understood, e.g. 192.168.1.20',
    fr: 'Adresse incomprise, ex. 192.168.1.20',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20',
    es: 'Dirección no válida, p. ej. 192.168.1.20',
  },
};

// One short explanation per error kind (src/decoder/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer (off, or wrong address)',
    fr: 'ne répond pas (éteint, ou mauvaise adresse)',
    de: 'antwortet nicht (aus oder falsche Adresse)',
    es: 'no responde (apagado o dirección incorrecta)',
  },
  [ERROR_KINDS.PROTOCOL]: {
    en: 'answers, but is not an Orange TV decoder',
    fr: "répond, mais n'est pas un décodeur TV d'Orange",
    de: 'antwortet, ist aber kein Orange-TV-Decoder',
    es: 'responde, pero no es un decodificador Orange TV',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'refused the request',
    fr: 'a refusé la demande',
    de: 'hat die Anfrage abgelehnt',
    es: 'ha rechazado la solicitud',
  },
};

// The decoder state (device text, widget, report).
export const STATE_TEXT = {
  on: { en: 'On', fr: 'Allumé', de: 'An', es: 'Encendido' },
  standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En espera' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  unknown: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
};

// What the decoder shows when no live channel is tuned (`osdContext`).
// Other contexts are shown as the decoder names them.
export const CONTEXT_TEXT = {
  HOMEPAGE: { en: 'Home page', fr: "Page d'accueil", de: 'Startseite', es: 'Página de inicio' },
  VOD: {
    en: 'Video on demand',
    fr: 'Vidéo à la demande',
    de: 'Video auf Abruf',
    es: 'Vídeo a la carta',
  },
  NETFLIX: { en: 'Netflix', fr: 'Netflix', de: 'Netflix', es: 'Netflix' },
  none: { en: 'No channel', fr: 'Aucune chaîne', de: 'Kein Sender', es: 'Ningún canal' },
};

export const ACTION_TEXT = {
  noDecoder: {
    en: 'No decoder in the configuration of the integration.',
    fr: "Aucun décodeur dans la configuration de l'intégration.",
    de: 'Kein Decoder in der Konfiguration der Integration.',
    es: 'Ningún decodificador en la configuración de la integración.',
  },
  unknownDecoder: {
    en: 'This decoder is no longer in the configuration of the integration.',
    fr: "Ce décodeur n'est plus dans la configuration de l'intégration.",
    de: 'Dieser Decoder ist nicht mehr in der Konfiguration der Integration.',
    es: 'Este decodificador ya no está en la configuración de la integración.',
  },
  offline: {
    en: 'The decoder does not answer: in deep standby it can only be turned on with its remote.',
    fr: 'Le décodeur ne répond pas : en veille profonde, il ne se rallume qu’avec sa télécommande.',
    de: 'Der Decoder antwortet nicht: Aus dem Tiefschlaf lässt er sich nur mit seiner Fernbedienung einschalten.',
    es: 'El decodificador no responde: en espera profunda solo se enciende con su mando.',
  },
  standby: {
    en: 'The decoder is in standby: turn it on first.',
    fr: "Le décodeur est en veille : allumez-le d'abord.",
    de: 'Der Decoder ist im Standby: Schalte ihn zuerst ein.',
    es: 'El decodificador está en espera: enciéndalo primero.',
  },
  wakeFailed: {
    en: 'The decoder did not leave standby.',
    fr: "Le décodeur n'est pas sorti de veille.",
    de: 'Der Decoder ist nicht aus dem Standby aufgewacht.',
    es: 'El decodificador no ha salido del modo de espera.',
  },
  badChannel: {
    en: 'Channel number not understood: a whole number from 1 to 9999.',
    fr: 'Numéro de chaîne incompris : un nombre entier de 1 à 9999.',
    de: 'Sendernummer nicht verstanden: eine ganze Zahl von 1 bis 9999.',
    es: 'Número de canal no válido: un número entero de 1 a 9999.',
  },
  badKey: {
    en: 'Unknown key.',
    fr: 'Touche inconnue.',
    de: 'Unbekannte Taste.',
    es: 'Tecla desconocida.',
  },
};

// "Test the decoders": one line per decoder.
export const REPORT_TEXT = {
  en: { ok: 'answers' },
  fr: { ok: 'répond' },
  de: { ok: 'antwortet' },
  es: { ok: 'responde' },
};
