// Original content written for Auselia's actual product (an early-stage
// acoustic-emission sensor + Supabase-backed plant dashboard), not a
// translation of any e-commerce template. The legal entity name, RUT and
// address are left as an explicit [TBD] placeholder until the company is
// formally incorporated, per the founder's own instruction.

import type { Lang } from "./i18n";

export type LegalDoc = {
  title: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
};

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: September 22, 2026",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [
        "This Privacy Policy describes how Auselia ([TBD], to be completed once the company is formally incorporated) collects, uses and protects personal data on this website and the Auselia dashboard.",
        "By using this website or the dashboard, you agree to the practices described here. If you do not agree, please do not use the site.",
      ],
    },
    {
      heading: "What we collect",
      paragraphs: [
        "Contact form. When you submit the contact form, we collect the name, email address, optional organization name and message you provide, along with the language you were using.",
        "Account and dashboard data. If you sign in as a partner, we collect the email address used for your account and, for the organization you belong to, the sensor and telemetry data your own hardware sends us. This data belongs to your organization, not to Auselia.",
        "Cookies. We use a small cookie to remember your chosen language (auselia-locale) and, inside the dashboard, a browser setting to remember your color theme preference. Signing in also sets a session cookie managed by our authentication provider, Supabase. We do not use advertising or tracking cookies.",
      ],
    },
    {
      heading: "How we use it",
      paragraphs: [
        "To respond to messages sent through the contact form.",
        "To operate partner accounts and the dashboard, including authenticating sign-ins and showing an organization its own sensor data.",
        "To keep the site and dashboard secure and working correctly.",
      ],
    },
    {
      heading: "Who we share it with",
      paragraphs: [
        "We do not sell personal data. We use a small number of service providers to run this website and the dashboard, each acting under its own privacy commitments: Supabase (database, authentication and file storage), Vercel (website hosting) and Resend (sending contact-form notification emails). These providers may process data on servers located outside Chile.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "Contact-form submissions are kept until you ask us to delete them. Sensor and telemetry data is kept for as long as the organization it belongs to remains a partner, or as otherwise agreed with that organization.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Under Chilean Law No. 19.628 on the Protection of Personal Data, you can ask to access, correct or delete the personal data we hold about you. To do so, write to us using the contact details below.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "This website is not directed at children, and we do not knowingly collect personal data from anyone under 14 years of age.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "We may update this policy as the site, the dashboard or the law changes. We will post the updated version here with a new effective date.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Questions about this policy can be sent through our contact page, or to [TBD] once a dedicated privacy address is set up.",
      ],
    },
  ],
};

const privacyEs: LegalDoc = {
  title: "Política de Privacidad",
  updated: "Última actualización: 22 de septiembre de 2026",
  sections: [
    {
      heading: "Quiénes somos",
      paragraphs: [
        "Esta Política de Privacidad describe cómo Auselia ([TBD], a completar una vez que la empresa esté formalmente constituida) recolecta, usa y protege los datos personales en este sitio web y en el panel de Auselia.",
        "Al usar este sitio web o el panel, aceptas las prácticas descritas aquí. Si no estás de acuerdo, por favor no uses el sitio.",
      ],
    },
    {
      heading: "Qué recolectamos",
      paragraphs: [
        "Formulario de contacto. Cuando envías el formulario de contacto, recolectamos el nombre, correo electrónico, el nombre de organización (opcional) y el mensaje que nos proporcionas, junto con el idioma que estabas usando.",
        "Datos de cuenta y del panel. Si inicias sesión como socio, recolectamos el correo electrónico de tu cuenta y, para la organización a la que perteneces, los datos de sensores y telemetría que envía tu propio hardware. Estos datos pertenecen a tu organización, no a Auselia.",
        "Cookies. Usamos una pequeña cookie para recordar el idioma que elegiste (auselia-locale) y, dentro del panel, una preferencia del navegador para recordar tu tema de color. Al iniciar sesión también se crea una cookie de sesión administrada por nuestro proveedor de autenticación, Supabase. No usamos cookies de publicidad ni de rastreo.",
      ],
    },
    {
      heading: "Cómo lo usamos",
      paragraphs: [
        "Para responder a los mensajes enviados a través del formulario de contacto.",
        "Para operar las cuentas de socios y el panel, incluyendo la autenticación de inicios de sesión y mostrar a cada organización sus propios datos de sensores.",
        "Para mantener el sitio y el panel seguros y funcionando correctamente.",
      ],
    },
    {
      heading: "Con quién lo compartimos",
      paragraphs: [
        "No vendemos datos personales. Usamos un número reducido de proveedores para operar este sitio web y el panel, cada uno bajo sus propios compromisos de privacidad: Supabase (base de datos, autenticación y almacenamiento de archivos), Vercel (alojamiento del sitio web) y Resend (envío de notificaciones por correo del formulario de contacto). Estos proveedores pueden procesar datos en servidores ubicados fuera de Chile.",
      ],
    },
    {
      heading: "Cuánto tiempo lo conservamos",
      paragraphs: [
        "Los mensajes del formulario de contacto se conservan hasta que nos solicites eliminarlos. Los datos de sensores y telemetría se conservan mientras la organización a la que pertenecen siga siendo socia, o según lo que se acuerde con esa organización.",
      ],
    },
    {
      heading: "Tus derechos",
      paragraphs: [
        "De acuerdo a la Ley N.º 19.628 sobre Protección de Datos Personales, puedes solicitar acceder, rectificar o eliminar los datos personales que tenemos sobre ti. Para hacerlo, escríbenos a través de los datos de contacto indicados a continuación.",
      ],
    },
    {
      heading: "Menores de edad",
      paragraphs: [
        "Este sitio web no está dirigido a menores de edad, y no recolectamos a sabiendas datos personales de personas menores de 14 años.",
      ],
    },
    {
      heading: "Cambios a esta política",
      paragraphs: [
        "Podemos actualizar esta política a medida que cambien el sitio, el panel o la legislación aplicable. Publicaremos la versión actualizada aquí con una nueva fecha de vigencia.",
      ],
    },
    {
      heading: "Contacto",
      paragraphs: [
        "Las preguntas sobre esta política pueden enviarse a través de nuestra página de contacto, o a [TBD] una vez que se establezca un correo dedicado a privacidad.",
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Use",
  updated: "Last updated: September 22, 2026",
  sections: [
    {
      heading: "Acceptance of these terms",
      paragraphs: [
        'These Terms of Use govern your access to and use of the Auselia website and dashboard (together, the "Service"), operated by Auselia ([TBD], to be completed once the company is formally incorporated). By using the Service, you accept these terms. If you do not accept them, please do not use the Service.',
      ],
    },
    {
      heading: "Description of the Service",
      paragraphs: [
        'Auselia is an early-stage company building acoustic-emission sensor hardware and a web dashboard that shows the readings that hardware produces. The public demo available on this website shows simulated, clearly labeled sample data, not a real deployment. The Service, including the demo and the dashboard, is provided "as is" and "as available", without a guarantee of uptime, while the product is still in active development.',
      ],
    },
    {
      heading: "Accounts",
      paragraphs: [
        "Partner accounts give an organization access to its own sensor data. You are responsible for keeping your login credentials confidential and for all activity under your account. Tell us immediately if you suspect unauthorized access.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: [
        "You agree not to use the Service to attempt unauthorized access to any account or system, to scrape or extract data from the Service beyond normal use, to interfere with the Service's operation, or to reverse engineer the dashboard or the hardware's firmware.",
      ],
    },
    {
      heading: "Data ownership",
      paragraphs: [
        "An organization's own sensor and telemetry data belongs to that organization. Auselia does not claim ownership of it and uses it only to operate the dashboard for that organization.",
      ],
    },
    {
      heading: "Accuracy disclaimer",
      paragraphs: [
        "The hardware and the analysis it produces (including cavitation detection and acoustic-emission metrics) are still in active research and development. Readings can be delayed, incomplete or inaccurate, and should not be the sole basis for irrigation or other agronomic decisions.",
      ],
    },
    {
      heading: "Intellectual property",
      paragraphs: [
        "The Auselia name, logo, website content, dashboard interface and firmware are the property of Auselia or its licensors. Nothing in these terms grants you rights to them beyond what is needed to use the Service.",
      ],
    },
    {
      heading: "Termination",
      paragraphs: [
        "We may suspend or end access to the Service, including a partner account, at any time, particularly in case of a breach of these terms.",
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [
        "These terms are governed by the laws of the Republic of Chile ([TBD] pending the company's formal incorporation and the resulting choice of venue).",
      ],
    },
    {
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms as the Service changes. Continuing to use the Service after an update means you accept the revised terms.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: ["Questions about these terms can be sent through our contact page."],
    },
  ],
};

const termsEs: LegalDoc = {
  title: "Términos de Uso",
  updated: "Última actualización: 22 de septiembre de 2026",
  sections: [
    {
      heading: "Aceptación de estos términos",
      paragraphs: [
        'Estos Términos de Uso rigen tu acceso y uso del sitio web y panel de Auselia (en conjunto, el "Servicio"), operado por Auselia ([TBD], a completar una vez que la empresa esté formalmente constituida). Al usar el Servicio, aceptas estos términos. Si no los aceptas, por favor no uses el Servicio.',
      ],
    },
    {
      heading: "Descripción del Servicio",
      paragraphs: [
        'Auselia es una empresa en etapa temprana que desarrolla hardware de sensores de emisión acústica y un panel web que muestra las lecturas que produce ese hardware. La demo pública disponible en este sitio web muestra datos simulados, claramente identificados como tales, no una implementación real. El Servicio, incluyendo la demo y el panel, se entrega "tal cual" y "según disponibilidad", sin garantía de continuidad, mientras el producto sigue en desarrollo activo.',
      ],
    },
    {
      heading: "Cuentas",
      paragraphs: [
        "Las cuentas de socios otorgan a una organización acceso a sus propios datos de sensores. Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de toda actividad realizada bajo tu cuenta. Avísanos de inmediato si sospechas de un acceso no autorizado.",
      ],
    },
    {
      heading: "Uso aceptable",
      paragraphs: [
        "Aceptas no usar el Servicio para intentar acceder sin autorización a ninguna cuenta o sistema, extraer datos del Servicio más allá de un uso normal, interferir con su funcionamiento, ni realizar ingeniería inversa sobre el panel o el firmware del hardware.",
      ],
    },
    {
      heading: "Propiedad de los datos",
      paragraphs: [
        "Los datos de sensores y telemetría de una organización pertenecen a esa organización. Auselia no reclama su propiedad y los usa únicamente para operar el panel de esa organización.",
      ],
    },
    {
      heading: "Aviso sobre precisión",
      paragraphs: [
        "El hardware y el análisis que produce (incluyendo la detección de cavitación y las métricas de emisión acústica) siguen en investigación y desarrollo activo. Las lecturas pueden estar retrasadas, incompletas o ser inexactas, y no deben ser la única base para decisiones de riego u otras decisiones agronómicas.",
      ],
    },
    {
      heading: "Propiedad intelectual",
      paragraphs: [
        "El nombre Auselia, su logo, el contenido del sitio web, la interfaz del panel y el firmware son propiedad de Auselia o de quienes le otorgan licencias. Nada en estos términos te otorga derechos sobre ellos más allá de lo necesario para usar el Servicio.",
      ],
    },
    {
      heading: "Término del Servicio",
      paragraphs: [
        "Podemos suspender o terminar el acceso al Servicio, incluyendo una cuenta de socio, en cualquier momento, particularmente en caso de incumplimiento de estos términos.",
      ],
    },
    {
      heading: "Ley aplicable",
      paragraphs: [
        "Estos términos se rigen por las leyes de la República de Chile ([TBD] pendiente de la constitución formal de la empresa y la elección resultante de jurisdicción).",
      ],
    },
    {
      heading: "Cambios a estos términos",
      paragraphs: [
        "Podemos actualizar estos términos a medida que cambie el Servicio. Continuar usando el Servicio después de una actualización implica la aceptación de los términos revisados.",
      ],
    },
    {
      heading: "Contacto",
      paragraphs: ["Las preguntas sobre estos términos pueden enviarse a través de nuestra página de contacto."],
    },
  ],
};

export const PRIVACY: Record<Lang, LegalDoc> = { en: privacyEn, es: privacyEs };
export const TERMS: Record<Lang, LegalDoc> = { en: termsEn, es: termsEs };
