import type { Locale } from '../../i18n';
import type { LegalDocument } from './legal-document';

/*
 * DRAFT for the owner's legal review (P8-01). The Spanish text is the reference version; the
 * English one is a translation. Bracketed placeholders ([...]) must be filled in before launch.
 */

const es: LegalDocument = {
  title: 'Política de privacidad',
  description:
    'Qué datos trata RoomForge: tus proyectos se quedan en tu navegador, sin cuentas ni cookies.',
  updated: '2026-10-10',
  draft: true,
  sections: [
    {
      heading: 'Resumen',
      paragraphs: [
        'RoomForge funciona por completo en tu navegador. No necesitas cuenta, no usamos cookies y el contenido de tus proyectos nunca se envía a nuestros servidores.',
      ],
    },
    {
      heading: 'Responsable',
      paragraphs: [
        'El responsable de este sitio es [nombre o razón social del titular], con NIF [NIF] y domicilio en [domicilio]. Puedes escribirnos a [correo de contacto].',
      ],
    },
    {
      heading: 'Qué se guarda en tu dispositivo',
      paragraphs: [
        'Tus proyectos (habitaciones, objetos, materiales y luces) se guardan en el almacenamiento del navegador de tu dispositivo (IndexedDB). También guardamos ahí algunas preferencias, como el tema claro u oscuro y si ya has visto ciertos avisos.',
        'Estos datos no salen de tu dispositivo: no los recibimos, no los vemos y no podemos recuperarlos. Si borras los datos del sitio en tu navegador, se eliminan. Por eso te recomendamos exportar copias de seguridad.',
      ],
    },
    {
      heading: 'Enlaces compartidos',
      paragraphs: [
        'Cuando creas un enlace de solo lectura, la habitación se codifica en la parte del enlace que va después de «#». Los navegadores no envían esa parte a los servidores, así que nosotros no la recibimos.',
        'Cualquier persona que tenga el enlace puede ver la habitación. Compártelo solo con quien quieras y no incluyas datos personales en los nombres de proyectos u objetos.',
      ],
    },
    {
      heading: 'Datos técnicos del alojamiento',
      paragraphs: [
        'Para servirte las páginas, el proveedor de alojamiento ([proveedor de alojamiento]) recibe los datos técnicos de cada petición, como la dirección IP, el navegador y la página solicitada. Los usa para entregar el sitio y protegerlo frente a abusos, y los conserva durante [plazo de conservación]. Nosotros no los usamos para identificarte.',
      ],
    },
    {
      heading: 'Analítica',
      paragraphs: [
        'Ahora mismo RoomForge no usa ninguna herramienta de analítica.',
        'Si la activamos en el futuro, será una medición agregada de uso, sin cookies y sin identificadores personales. No incluirá el contenido de tus proyectos ni las direcciones de los enlaces compartidos, y respetará las señales «Do Not Track» y «Global Privacy Control» de tu navegador. Antes de activarla actualizaremos esta política.',
      ],
    },
    {
      heading: 'Cookies',
      paragraphs: [
        'No usamos cookies. El almacenamiento local que se describe arriba es necesario para que la aplicación funcione como pides (guardar tus proyectos y preferencias) y no se usa para seguirte.',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        'Como tus proyectos solo están en tu dispositivo, puedes consultarlos, exportarlos o borrarlos en cualquier momento desde la propia aplicación o borrando los datos del sitio en tu navegador.',
        'Para cualquier cuestión sobre privacidad, o para ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad, escríbenos a [correo de contacto]. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).',
      ],
    },
    {
      heading: 'Cambios',
      paragraphs: [
        'Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización.',
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Privacy policy',
  description:
    'What data RoomForge handles: your projects stay in your browser, with no accounts and no cookies.',
  updated: '2026-10-10',
  draft: true,
  sections: [
    {
      heading: 'Summary',
      paragraphs: [
        'RoomForge runs entirely in your browser. You do not need an account, we do not use cookies, and the content of your projects is never sent to our servers.',
      ],
    },
    {
      heading: 'Who is responsible',
      paragraphs: [
        'This site is run by [owner’s name or company name], tax ID [tax ID], address [address]. You can write to us at [contact email].',
      ],
    },
    {
      heading: 'What is stored on your device',
      paragraphs: [
        'Your projects (rooms, objects, materials and lights) are stored in your browser’s storage on your device (IndexedDB). A few preferences are stored there too, such as the light or dark theme and whether you have already seen certain notices.',
        'This data never leaves your device: we do not receive it, we cannot see it and we cannot recover it. Clearing the site data in your browser deletes it, which is why we recommend exporting backups.',
      ],
    },
    {
      heading: 'Shared links',
      paragraphs: [
        'When you create a read-only link, the room is encoded in the part of the link after the “#”. Browsers do not send that part to servers, so we never receive it.',
        'Anyone who has the link can see the room. Share it only with the people you choose, and do not put personal data in the names of projects or objects.',
      ],
    },
    {
      heading: 'Technical data of the hosting',
      paragraphs: [
        'To serve the pages, the hosting provider ([hosting provider]) receives the technical data of each request, such as the IP address, the browser and the page requested. It uses them to deliver the site and protect it from abuse, and keeps them for [retention period]. We do not use them to identify you.',
      ],
    },
    {
      heading: 'Analytics',
      paragraphs: [
        'RoomForge does not use any analytics tool at the moment.',
        'If we turn analytics on in the future, it will be an aggregate measurement of usage, without cookies and without personal identifiers. It will not include the content of your projects or the addresses of shared links, and it will respect your browser’s “Do Not Track” and “Global Privacy Control” signals. We will update this policy before turning it on.',
      ],
    },
    {
      heading: 'Cookies',
      paragraphs: [
        'We do not use cookies. The local storage described above is needed for the app to do what you ask (keep your projects and preferences) and is not used to track you.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'Since your projects are only on your device, you can view, export or delete them at any time from the app itself or by clearing the site data in your browser.',
        'For any privacy question, or to exercise your rights of access, rectification, erasure, objection, restriction and portability, write to [contact email]. You can also lodge a complaint with the Spanish Data Protection Agency (aepd.es).',
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'If we change this policy, we will publish the new version on this page with its update date.',
      ],
    },
  ],
};

export const privacyPolicy: Readonly<Record<Locale, LegalDocument>> = { es, en };
