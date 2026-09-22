// Copy for the public marketing surface (hero, contact, legal pages). This is
// deliberately separate from the dashboard's own i18n (src/lib/dashboard/i18n.ts):
// different content, different audience, and a different selection mechanism
// (a domain-default + cookie override here, vs a localStorage toggle there).

export type Lang = "en" | "es";

const en = {
  ctaContact: "Contact us",
  navPartnerSignIn: "Partner sign in",

  heroKicker: "Silicon that listens to plants",
  heroTitle: "Auselia is listening...",
  heroBodyPre:
    "A field node that hears the quiet acoustic signs of drought stress in a plant's xylem, long before it shows by looking. We're still early. Right now it's listening to one plant, named ",
  heroBodyPost: ".",
  ctaDemo: "Explore the live demo",
  heroTagline: "We listen to what plants can't say.",

  footerRights: "All rights reserved.",
  footerPrivacy: "Privacy Policy",
  footerTerms: "Terms of Use",
  footerContact: "Contact",

  contactTitle: "Get in touch",
  contactSubtitle:
    "Tell us about your farm, your research, or just say hello. We read every message.",
  contactName: "Name",
  contactEmail: "Email",
  contactOrg: "Organization (optional)",
  contactMessage: "Message",
  contactSubmit: "Send message",
  contactMissingFields: "Please fill in your name, email and a message.",
  contactGenericError: "Something went wrong sending your message. Please try again.",
  contactSentTitle: "Message sent",
  contactSentBody: "Thanks for reaching out. We'll get back to you soon.",
  backHome: "Back to home",

  contactConfirmSubject: "We received your message",
  contactConfirmBody:
    "Thanks for reaching out to Auselia. We've received your message and will get back to you as soon as possible.",

  metaHomeTitle: "Auselia",
  metaHomeDescription: "Silicon that listens to plants.",
  metaContactTitle: "Contact - Auselia",
  metaContactDescription: "Get in touch with the Auselia team.",
  metaPrivacyTitle: "Privacy Policy - Auselia",
  metaPrivacyDescription: "How Auselia collects, uses and protects your data.",
  metaTermsTitle: "Terms of Use - Auselia",
  metaTermsDescription: "The terms that govern use of the Auselia website and dashboard.",
};

const es: typeof en = {
  ctaContact: "Contáctanos",
  navPartnerSignIn: "Acceso de socios",

  heroKicker: "Silicio que escucha a las plantas",
  heroTitle: "Auselia está escuchando...",
  heroBodyPre:
    "Un nodo de campo que escucha las señales acústicas silenciosas del estrés hídrico en el xilema de una planta, mucho antes de que se note a simple vista. Aún estamos empezando. Por ahora, escucha a una sola planta, llamada ",
  heroBodyPost: ".",
  ctaDemo: "Explora la demo en vivo",
  heroTagline: "Escuchamos lo que las plantas no pueden decir.",

  footerRights: "Todos los derechos reservados.",
  footerPrivacy: "Política de Privacidad",
  footerTerms: "Términos de Uso",
  footerContact: "Contacto",

  contactTitle: "Contáctanos",
  contactSubtitle:
    "Cuéntanos sobre tu campo, tu investigación, o simplemente saluda. Leemos todos los mensajes.",
  contactName: "Nombre",
  contactEmail: "Correo electrónico",
  contactOrg: "Organización (opcional)",
  contactMessage: "Mensaje",
  contactSubmit: "Enviar mensaje",
  contactMissingFields: "Por favor completa tu nombre, correo electrónico y un mensaje.",
  contactGenericError: "Ocurrió un error al enviar tu mensaje. Por favor intenta nuevamente.",
  contactSentTitle: "Mensaje enviado",
  contactSentBody: "Gracias por contactarnos. Te responderemos pronto.",
  backHome: "Volver al inicio",

  contactConfirmSubject: "Recibimos tu mensaje",
  contactConfirmBody:
    "Gracias por contactar a Auselia. Hemos recibido tu mensaje y te responderemos lo antes posible.",

  metaHomeTitle: "Auselia",
  metaHomeDescription: "Silicio que escucha a las plantas.",
  metaContactTitle: "Contacto - Auselia",
  metaContactDescription: "Ponte en contacto con el equipo de Auselia.",
  metaPrivacyTitle: "Política de Privacidad - Auselia",
  metaPrivacyDescription: "Cómo Auselia recolecta, usa y protege tus datos.",
  metaTermsTitle: "Términos de Uso - Auselia",
  metaTermsDescription: "Los términos que rigen el uso del sitio web y panel de Auselia.",
};

export const STR: Record<Lang, typeof en> = { en, es };
export type Strings = typeof en;
