import type { Locale } from '../i18n';

/**
 * Texts of the public site (landing, footer). They are only rendered by server components, so
 * neither dictionary reaches the browser as JavaScript: the pages are plain HTML.
 */
export interface SiteMessages {
  readonly lang: string;
  readonly skipToContent: string;
  readonly nav: { readonly label: string; readonly editor: string; readonly projects: string };
  readonly otherLocale: { readonly label: string; readonly name: string };
  readonly meta: { readonly title: string; readonly description: string };
  readonly hero: {
    readonly eyebrow: string;
    readonly lead: string;
    readonly body: string;
    readonly primary: string;
    readonly secondary: string;
    readonly note: string;
    readonly illustration: string;
  };
  readonly features: {
    readonly title: string;
    readonly items: readonly { readonly title: string; readonly body: string }[];
  };
  readonly steps: { readonly title: string; readonly items: readonly string[] };
  readonly faq: {
    readonly title: string;
    readonly items: readonly { readonly question: string; readonly answer: string }[];
  };
  readonly closing: { readonly title: string; readonly body: string; readonly cta: string };
  readonly footer: {
    readonly label: string;
    readonly tagline: string;
    readonly rights: string;
    readonly privacy: string;
    readonly terms: string;
    readonly licenses: string;
    readonly feedback: string;
  };
  readonly legal: { readonly updated: string; readonly draft: string; readonly reference: string };
  readonly licensesPage: {
    readonly title: string;
    readonly description: string;
    readonly intro: string;
    readonly modelsTitle: string;
    readonly modelsIntro: string;
    readonly ownLicense: string;
    readonly modelColumns: {
      readonly name: string;
      readonly author: string;
      readonly license: string;
      readonly attribution: string;
    };
    readonly softwareTitle: string;
    readonly softwareIntro: string;
    readonly softwareColumns: {
      readonly name: string;
      readonly version: string;
      readonly license: string;
    };
    readonly fontsTitle: string;
    readonly fonts: readonly string[];
  };
}

const en: SiteMessages = {
  lang: 'en',
  skipToContent: 'Skip to content',
  nav: { label: 'Main', editor: 'Open the editor', projects: 'Projects' },
  otherLocale: { label: 'Leer en español', name: 'Español' },
  meta: {
    title: 'RoomForge: design your room and gaming setup in 3D',
    description:
      'Plan rooms, home offices and gaming setups in 3D and try LED and RGB lighting by day and by night. Free, no account, and your projects never leave your browser.',
  },
  hero: {
    eyebrow: 'Rooms, offices and gaming setups',
    lead: 'Design your space in 3D and see it lit before you buy a thing.',
    body: 'Set the size of the room, furnish it from the catalog and light it with LED strips, light bars and RGB panels. Switch to night to see how it really glows.',
    primary: 'Start designing',
    secondary: 'My projects',
    note: 'Free during the beta. No account, nothing to install.',
    illustration:
      'Illustration: a desk with a monitor and a chair, lit from behind by an LED strip in orange and blue.',
  },
  features: {
    title: 'What you can do',
    items: [
      {
        title: 'Design in 3D',
        body: 'Draw the room to size, then place, move and rotate desks, chairs, monitors and lamps with snapping that keeps things tidy.',
      },
      {
        title: 'Light it with LED and RGB',
        body: 'Pick colours and intensity for strips, bars, panels and neon signs, and compare day and night views of the same room.',
      },
      {
        title: 'Private by design',
        body: 'Everything runs in your browser. Projects are stored on this device and are never uploaded: there are no accounts and no tracking cookies.',
      },
      {
        title: 'Back up and share',
        body: 'Export a project file as a backup, or share a read-only link: the room travels inside the link itself, not through our servers.',
      },
    ],
  },
  steps: {
    title: 'How it works',
    items: [
      'Create a room and set its width, depth and height.',
      'Furnish it from the catalog and arrange everything.',
      'Add lights, choose colours and switch to night.',
      'Keep it in your browser, export a backup or share a link.',
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        question: 'Do I need an account?',
        answer:
          'No. RoomForge works without signing up. Your projects are saved automatically in this browser.',
      },
      {
        question: 'Where are my projects stored?',
        answer:
          'Only on your device, in the browser storage. Clearing the site data deletes them, so export a backup file from time to time. You can import it again later or on another computer.',
      },
      {
        question: 'Does anything I design get sent to a server?',
        answer:
          'No. The editor never uploads the content of your projects. A shared link carries the room in the part of the address after the #, which browsers do not send to servers.',
      },
      {
        question: 'Is the lighting physically accurate?',
        answer:
          'It is a visual preview to plan the mood of a room, not a lighting calculation. Colours and brightness depend on your screen as well.',
      },
      {
        question: 'What do I need to run it?',
        answer:
          'A recent version of Chrome, Edge, Firefox or Safari on a computer with WebGL 2. A mouse or trackpad is the most comfortable way to edit.',
      },
      {
        question: 'Does it cost anything?',
        answer: 'It is free during the beta.',
      },
    ],
  },
  closing: {
    title: 'Ready to plan your setup?',
    body: 'Open the editor and have a first room lit in a few minutes.',
    cta: 'Start designing',
  },
  footer: {
    label: 'Site',
    tagline: 'Design rooms, offices and gaming setups in 3D.',
    rights: '© {year} RoomForge',
    privacy: 'Privacy',
    terms: 'Terms',
    licenses: 'Licences',
    feedback: 'Send feedback',
  },
  legal: {
    updated: 'Last updated: {date}',
    draft: 'Draft pending legal review. This text may still change before the public launch.',
    reference: 'This is a translation; the Spanish version is the reference text.',
  },
  licensesPage: {
    title: 'Licences and attributions',
    description: 'The licences of the 3D models, software and fonts that RoomForge uses.',
    intro:
      'RoomForge is built on open source software and on 3D models of its own. This page is generated from the catalog manifest and the dependency report, so it always matches what the app ships.',
    modelsTitle: '3D models of the catalog',
    modelsIntro: 'Every model in the catalog, with its author and licence.',
    ownLicense: 'Original RoomForge model, all rights reserved',
    modelColumns: {
      name: 'Model',
      author: 'Author',
      license: 'Licence',
      attribution: 'Attribution',
    },
    softwareTitle: 'Open source software',
    softwareIntro:
      'The packages the app ships to your browser, and everything they depend on, with their licences.',
    softwareColumns: { name: 'Package', version: 'Version', license: 'Licence' },
    fontsTitle: 'Fonts',
    fonts: [
      'Inter, by Rasmus Andersson, under the SIL Open Font License 1.1 (package @fontsource-variable/inter).',
      'Geist, by Vercel, under the SIL Open Font License 1.1, in the social card image.',
    ],
  },
};

const es: SiteMessages = {
  lang: 'es',
  skipToContent: 'Saltar al contenido',
  nav: { label: 'Principal', editor: 'Abrir el editor', projects: 'Proyectos' },
  otherLocale: { label: 'Read in English', name: 'English' },
  meta: {
    title: 'RoomForge: diseña tu habitación y tu setup gaming en 3D',
    description:
      'Planifica habitaciones, despachos y setups gaming en 3D y prueba la iluminación LED y RGB de día y de noche. Gratis, sin cuenta y sin que tus proyectos salgan del navegador.',
  },
  hero: {
    eyebrow: 'Habitaciones, despachos y setups gaming',
    lead: 'Diseña tu espacio en 3D y míralo iluminado antes de comprar nada.',
    body: 'Indica el tamaño de la habitación, amuéblala desde el catálogo e ilumínala con tiras LED, barras de luz y paneles RGB. Pasa a la noche para ver cómo brilla de verdad.',
    primary: 'Empezar a diseñar',
    secondary: 'Mis proyectos',
    note: 'Gratis durante la beta. Sin cuenta y sin instalar nada.',
    illustration:
      'Ilustración: un escritorio con un monitor y una silla, iluminados por detrás con una tira LED naranja y azul.',
  },
  features: {
    title: 'Qué puedes hacer',
    items: [
      {
        title: 'Diseña en 3D',
        body: 'Dibuja la habitación a medida y coloca, mueve y gira escritorios, sillas, monitores y lámparas con un ajuste que lo mantiene todo ordenado.',
      },
      {
        title: 'Ilumina con LED y RGB',
        body: 'Elige color e intensidad para tiras, barras, paneles y letreros de neón, y compara la misma habitación de día y de noche.',
      },
      {
        title: 'Privado por diseño',
        body: 'Todo funciona en tu navegador. Los proyectos se guardan en este dispositivo y nunca se suben: no hay cuentas ni cookies de seguimiento.',
      },
      {
        title: 'Copia de seguridad y enlaces',
        body: 'Exporta un archivo del proyecto como copia de seguridad o comparte un enlace de solo lectura: la habitación viaja dentro del propio enlace, no por nuestros servidores.',
      },
    ],
  },
  steps: {
    title: 'Cómo funciona',
    items: [
      'Crea una habitación con su ancho, fondo y alto.',
      'Amuéblala desde el catálogo y colócalo todo.',
      'Añade luces, elige colores y pasa a la noche.',
      'Guárdala en tu navegador, exporta una copia o comparte un enlace.',
    ],
  },
  faq: {
    title: 'Preguntas frecuentes',
    items: [
      {
        question: '¿Necesito una cuenta?',
        answer:
          'No. RoomForge funciona sin registrarse. Tus proyectos se guardan automáticamente en este navegador.',
      },
      {
        question: '¿Dónde se guardan mis proyectos?',
        answer:
          'Solo en tu dispositivo, en el almacenamiento del navegador. Si borras los datos del sitio se pierden, así que exporta de vez en cuando un archivo de copia. Puedes volver a importarlo más tarde o en otro ordenador.',
      },
      {
        question: '¿Se envía a algún servidor lo que diseño?',
        answer:
          'No. El editor nunca sube el contenido de tus proyectos. Un enlace compartido lleva la habitación en la parte de la dirección que va después de #, que los navegadores no envían a los servidores.',
      },
      {
        question: '¿La iluminación es físicamente exacta?',
        answer:
          'Es una vista previa para planificar el ambiente de una habitación, no un cálculo luminotécnico. Los colores y el brillo dependen también de tu pantalla.',
      },
      {
        question: '¿Qué necesito para usarlo?',
        answer:
          'Una versión reciente de Chrome, Edge, Firefox o Safari en un ordenador con WebGL 2. Con ratón o trackpad se edita con más comodidad.',
      },
      {
        question: '¿Cuesta algo?',
        answer: 'Es gratis durante la beta.',
      },
    ],
  },
  closing: {
    title: '¿Listo para planificar tu setup?',
    body: 'Abre el editor y ten una primera habitación iluminada en pocos minutos.',
    cta: 'Empezar a diseñar',
  },
  footer: {
    label: 'Sitio',
    tagline: 'Diseña habitaciones, despachos y setups gaming en 3D.',
    rights: '© {year} RoomForge',
    privacy: 'Privacidad',
    terms: 'Términos',
    licenses: 'Licencias',
    feedback: 'Enviar comentarios',
  },
  legal: {
    updated: 'Última actualización: {date}',
    draft:
      'Borrador pendiente de revisión legal. Este texto aún puede cambiar antes del lanzamiento público.',
    reference: 'Esta es la versión de referencia del texto.',
  },
  licensesPage: {
    title: 'Licencias y atribuciones',
    description: 'Las licencias de los modelos 3D, el software y las fuentes que usa RoomForge.',
    intro:
      'RoomForge está hecho con software de código abierto y con modelos 3D propios. Esta página se genera a partir del manifiesto del catálogo y del informe de dependencias, así que siempre coincide con lo que publica la aplicación.',
    modelsTitle: 'Modelos 3D del catálogo',
    modelsIntro: 'Cada modelo del catálogo, con su autor y su licencia.',
    ownLicense: 'Modelo original de RoomForge, todos los derechos reservados',
    modelColumns: {
      name: 'Modelo',
      author: 'Autor',
      license: 'Licencia',
      attribution: 'Atribución',
    },
    softwareTitle: 'Software de código abierto',
    softwareIntro:
      'Los paquetes que la aplicación envía a tu navegador, y todo aquello de lo que dependen, con sus licencias.',
    softwareColumns: { name: 'Paquete', version: 'Versión', license: 'Licencia' },
    fontsTitle: 'Fuentes tipográficas',
    fonts: [
      'Inter, de Rasmus Andersson, con licencia SIL Open Font License 1.1 (paquete @fontsource-variable/inter).',
      'Geist, de Vercel, con licencia SIL Open Font License 1.1, en la imagen para redes sociales.',
    ],
  },
};

export const siteMessages: Readonly<Record<Locale, SiteMessages>> = { en, es };
