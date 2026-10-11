import type { Locale } from '../../i18n';
import type { LegalDocument } from './legal-document';

/*
 * DRAFT for the owner's legal review (P8-01). The Spanish text is the reference version; the
 * English one is a translation. Bracketed placeholders ([...]) must be filled in before launch.
 */

const es: LegalDocument = {
  title: 'Términos de uso',
  description:
    'Condiciones para usar RoomForge durante la beta: gratis, tal cual y con tus proyectos bajo tu control.',
  updated: '2026-10-10',
  draft: true,
  sections: [
    {
      heading: 'Quién ofrece el servicio',
      paragraphs: [
        'RoomForge es un servicio de [nombre o razón social del titular], con NIF [NIF] y domicilio en [domicilio]. Contacto: [correo de contacto]. Al usar RoomForge aceptas estos términos.',
      ],
    },
    {
      heading: 'El servicio durante la beta',
      paragraphs: [
        'RoomForge es una herramienta web para diseñar habitaciones, despachos y setups en 3D y simular su iluminación. Durante la beta es gratuita y no requiere cuenta.',
        'Al ser una beta puede cambiar, tener errores o dejar de estar disponible. La ofrecemos «tal cual», sin garantía de que funcione sin interrupciones o de que sirva para un fin concreto.',
      ],
    },
    {
      heading: 'Tus proyectos',
      paragraphs: [
        'Lo que diseñas es tuyo. Tus proyectos se guardan solo en tu navegador, así que eres responsable de hacer copias de seguridad: si borras los datos del sitio o cambias de dispositivo sin exportarlos, no podremos recuperarlos.',
        'Puedes usar libremente las imágenes y archivos que exportes de tus diseños. [Revisar: alcance del uso comercial de imágenes que incluyan modelos del catálogo.]',
      ],
    },
    {
      heading: 'Uso aceptable',
      paragraphs: [
        'No uses RoomForge para fines ilícitos, para intentar dañar o sobrecargar el servicio, ni para difundir mediante enlaces compartidos contenidos que infrinjan derechos de terceros. Eres responsable de lo que compartes.',
      ],
    },
    {
      heading: 'Propiedad intelectual',
      paragraphs: [
        'El software de RoomForge y los modelos 3D propios del catálogo son de [titular], con todos los derechos reservados. Los componentes de terceros se usan bajo sus licencias, que se detallan en la página de licencias.',
        'No está permitido extraer el catálogo de modelos para distribuirlo por separado.',
      ],
    },
    {
      heading: 'Una simulación orientativa',
      paragraphs: [
        'Las medidas, colores e iluminación que muestra RoomForge son orientativos y dependen también de tu pantalla. No sustituyen un proyecto técnico, eléctrico o luminotécnico. Comprueba las medidas y las especificaciones reales antes de comprar o instalar nada.',
      ],
    },
    {
      heading: 'Responsabilidad',
      paragraphs: [
        'En la medida en que lo permita la ley, no respondemos de daños indirectos ni de la pérdida de proyectos guardados en tu dispositivo. Nada de lo anterior limita los derechos que te reconozca la normativa de consumidores aplicable.',
      ],
    },
    {
      heading: 'Cambios y legislación',
      paragraphs: [
        'Podemos actualizar estos términos; publicaremos la nueva versión en esta página con su fecha. Estos términos se rigen por la legislación española. [Revisar: jurisdicción y resolución de conflictos con consumidores.]',
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Terms of use',
  description:
    'The terms for using RoomForge during the beta: free, as is, and with your projects under your control.',
  updated: '2026-10-10',
  draft: true,
  sections: [
    {
      heading: 'Who provides the service',
      paragraphs: [
        'RoomForge is a service of [owner’s name or company name], tax ID [tax ID], address [address]. Contact: [contact email]. By using RoomForge you accept these terms.',
      ],
    },
    {
      heading: 'The service during the beta',
      paragraphs: [
        'RoomForge is a web tool to design rooms, home offices and setups in 3D and preview their lighting. During the beta it is free and needs no account.',
        'As a beta it may change, have bugs or stop being available. It is provided “as is”, with no guarantee that it will work without interruptions or suit a particular purpose.',
      ],
    },
    {
      heading: 'Your projects',
      paragraphs: [
        'What you design is yours. Your projects are stored only in your browser, so you are responsible for backing them up: if you clear the site data or switch devices without exporting them, we cannot recover them.',
        'You may freely use the images and files you export from your designs. [To review: scope of commercial use of images that include catalog models.]',
      ],
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        'Do not use RoomForge for unlawful purposes, to try to harm or overload the service, or to spread content that infringes the rights of others through shared links. You are responsible for what you share.',
      ],
    },
    {
      heading: 'Intellectual property',
      paragraphs: [
        'The RoomForge software and the catalog’s own 3D models belong to [owner], all rights reserved. Third-party components are used under their licences, listed on the licences page.',
        'Extracting the model catalog to distribute it separately is not allowed.',
      ],
    },
    {
      heading: 'An approximate preview',
      paragraphs: [
        'The sizes, colours and lighting RoomForge shows are approximate and also depend on your screen. They do not replace a technical, electrical or lighting design. Check the real measurements and specifications before buying or installing anything.',
      ],
    },
    {
      heading: 'Liability',
      paragraphs: [
        'To the extent the law allows, we are not liable for indirect damage or for the loss of projects stored on your device. Nothing here limits the rights that applicable consumer law gives you.',
      ],
    },
    {
      heading: 'Changes and governing law',
      paragraphs: [
        'We may update these terms; we will publish the new version on this page with its date. These terms are governed by Spanish law. [To review: jurisdiction and consumer dispute resolution.]',
      ],
    },
  ],
};

export const termsOfUse: Readonly<Record<Locale, LegalDocument>> = { es, en };
