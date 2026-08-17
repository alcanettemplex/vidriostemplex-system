export interface MensajeComercial {
  id: number;
  fase: string;
  titulo: string;
  descripcion: string;
  estadoCrm: string;
  momento: string;
  tip: string;
  mensajes: {
    tipo: string;
    texto: string;
  }[];
}

export const MENSAJES_COMERCIALES: MensajeComercial[] = [
  // ─── FASE 1 — PRIMER CONTACTO ────────────────────────────────────────────
  {
    id: 1,
    fase: 'Primer contacto',
    titulo: 'Primer contacto — interés general',
    descripcion: 'Lead recién asignado, primera conversación. Máximo 2 horas tras la asignación.',
    estadoCrm: 'NUEVO / ASIGNADO',
    momento: 'Lunes–viernes, 8:00–10:00',
    tip: 'Personaliza con el producto real que el cliente pidió — la mención específica sube la tasa de respuesta. Nunca vendas en el primer mensaje: primero escucha.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], muy buen día. Soy [tu nombre], de Vidrios Templex. Me llegó su información por interés en [tipo de producto] y antes de ofrecerle nada me gustaría entender su proyecto: ¿es para su vivienda, un local o una obra? ¿En qué etapa está? Así le puedo recomendar lo que de verdad le convenga.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 👋 Soy [tu nombre], de Vidrios Templex. Vi que le interesa [tipo de producto] y quería saludarlo antes de mandarle cualquier cosa. Cuénteme, ¿qué está buscando exactamente? Sin compromiso, solo para saber cómo ayudarle.',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], le saluda [tu nombre], asesor de Vidrios Templex. Recibimos su solicitud de información sobre [tipo de producto]. Para poder recomendarle la solución más adecuada a su proyecto, agradecería me comente el tipo de obra y las necesidades que tiene. Quedo atento a su respuesta.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], muy buen día. Soy [tu nombre] de Vidrios Templex — fabricamos e instalamos [tipo de producto] con garantía real y acompañamiento de principio a fin. Para que esa garantía le sirva de verdad, quiero primero entender su proyecto antes de recomendarle algo. ¿Me cuenta en qué consiste?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], soy [tu nombre] de Vidrios Templex. ¿Me podría contar qué proyecto de [tipo de producto] tiene en mente? Con eso le doy una recomendación inicial sin compromiso.',
      },
    ],
  },
  {
    id: 2,
    fase: 'Primer contacto',
    titulo: 'Primer contacto — llegó por recomendación',
    descripcion: 'Cliente referido por un cliente, arquitecto o contacto de confianza. Usar el nombre del referidor.',
    estadoCrm: 'NUEVO / ASIGNADO',
    momento: 'Lunes–viernes, 8:00–10:00',
    tip: 'El referido confía en quien lo refirió — mencionar el nombre del referidor es el ancla de confianza más fuerte que existe.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], muy buen día. Soy [tu nombre] de Vidrios Templex — me pasó su contacto [nombre de quien refirió], quien nos confió su proyecto anterior. Antes de proponerle algo, ¿me cuenta qué necesita? Así seguimos cuidando a las personas que llegan referidas por esa confianza.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 👋 [Nombre de quien refirió] nos habló muy bien de usted y me pidió que lo contactara. Qué gusto. Cuénteme, ¿qué proyecto tiene entre manos? Estoy aquí para ayudarle a que quede como usted lo imagina.',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], reciba un cordial saludo de Vidrios Templex. [Nombre de quien refirió] nos recomendó con usted por la calidad de nuestro trabajo. Para ofrecerle una asesoría acertada, ¿podría indicarme las características de su proyecto de [tipo de producto]?',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], muy buen día. Somos Vidrios Templex y nos alegra que [nombre de quien refirió] pensara en nosotros para usted. Trabajamos con materiales certificados y garantía de [X] años. Para recomendarle lo mejor, ¿me cuenta qué necesita su proyecto?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], soy [tu nombre] de Vidrios Templex. [Nombre de quien refirió] nos refirió con usted. ¿Qué proyecto de [tipo de producto] tiene en mente? Con gusto le asesoro.',
      },
    ],
  },
  {
    id: 3,
    fase: 'Primer contacto',
    titulo: 'Segundo intento (24–48h sin respuesta)',
    descripcion: 'No respondió al primer mensaje. Reenganchar regalando un beneficio nuevo, sin reclamar.',
    estadoCrm: 'EN_CONTACTO',
    momento: '24–48h después del primero, 10:00–12:00',
    tip: 'Nunca preguntes "¿no le llegó mi mensaje?" — regala un beneficio nuevo (asesoría gratis, medición en sitio) para reenganchar.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], le escribo de nuevo porque su proyecto me quedó dando vueltas. ¿Ya definió qué necesita para su [tipo de producto]? No es para presionar, es para saber si le puedo aportar algo o si le sirve que lo dejemos para cuando esté listo.',
      },
      {
        tipo: 'Cercana',
        texto: 'Hola [nombre del cliente] 👋, soy [tu nombre] otra vez por aquí. Quizá se le pasó mi mensaje entre tanto ajetreo 😊 Solo quería dejarle la puerta abierta: cuando quiera, le ayudo a resolver su [tipo de producto] sin compromiso. ¿Le sirve que hablemos?',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], retomo mi mensaje anterior en caso de que no haya tenido oportunidad de leerlo. Quedo a su disposición para conocer los detalles de su proyecto de [tipo de producto] y brindarle una asesoría sin compromiso.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], le escribo nuevamente porque quiero que tenga la oportunidad de conocer lo que hacemos: asesoría sin costo, medición en sitio y garantía real en [tipo de producto]. ¿Le gustaría que le cuente cómo funciona? Sin ningún compromiso.',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿sigue en pie su proyecto de [tipo de producto]? Si es así, con gusto le ayudo. Si no, no hay problema — quedamos en contacto.',
      },
    ],
  },
  {
    id: 4,
    fase: 'Primer contacto',
    titulo: 'Último intento (72h+ — cierre respetuoso)',
    descripcion: 'Cierre elegante que deja la puerta abierta sin quemar el lead. El cliente queda con buena imagen.',
    estadoCrm: 'EN_CONTACTO',
    momento: '72h+ después del primero',
    tip: 'Este mensaje no busca respuesta inmediata: construye reputación. Muchos leads responden días o semanas después precisamente por este cierre.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], último mensaje de mi parte, le prometo 🙂 Su proyecto de [tipo de producto] puede esperar el tiempo que necesite. Si en algún momento decide retomarlo, aquí estoy para asesorarle. Le deseo éxito con lo que esté adelantando.',
      },
      {
        tipo: 'Cercana',
        texto: 'Hola [nombre del cliente] 👋, cierro mi turno de mensajes por ahora 😊 Si el proyecto de [tipo de producto] sigue en pausa, tranquilo. Me deja su contacto guardado y cuando quiera me escribe. ¡Feliz resto de semana!',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], le escribo por última vez en esta oportunidad. Entiendo que su proyecto pueda no estar aún definido. Quedo registrado en su WhatsApp para cuando necesite una asesoría de [tipo de producto] sin compromiso.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], quería dejarle la información de contacto por si el proyecto despega más adelante: Vidrios Templex — [tu número/celular], asesoría sin costo y garantía de [X] años. Sin presión, solo para que sepa dónde encontrarnos.',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], me despido por ahora — quedamos en contacto para su [tipo de producto] cuando usted quiera. ¡Éxitos!',
      },
    ],
  },

  // ─── FASE 2 — DIAGNÓSTICO Y COTIZACIÓN ──────────────────────────────────
  {
    id: 5,
    fase: 'Diagnóstico y cotización',
    titulo: 'Explorando el proyecto',
    descripcion: 'Cliente interesado. Hacer preguntas específicas para recomendar a la medida.',
    estadoCrm: 'EN_CONTACTO',
    momento: 'Respuesta inmediata al interés del cliente',
    tip: 'Entre más información recojas, más precisa será la cotización y menos objeciones habrá después. Haz preguntas concretas, no abiertas.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: '¡Perfecto, [nombre del cliente]! Para recomendarle lo más adecuado, ¿me podría decir: 1) ¿Qué tipo de [tipo de producto] necesita? 2) ¿Medidas aproximadas o cantidad de unidades? 3) ¿Para cuándo lo quiere? Con eso le armo una propuesta a la medida.',
      },
      {
        tipo: 'Cercana',
        texto: 'Genial, [nombre del cliente] 😊 Cuénteme un poquito más: ¿qué ambiente o espacio va a usar? ¿Tiene alguna idea de estilo o material? Entre más me cuente, mejor le recomiendo. ¡No hay pregunta tonta!',
      },
      {
        tipo: 'Formal',
        texto: 'Gracias por la información, [nombre del cliente]. Para estructurar una cotización precisa, ¿podría indicarme las especificaciones de su proyecto: dimensiones, cantidad de [tipo de producto] y plazo estimado? Esto me permite asegurarle materiales y tiempos correctos.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Muy bien, [nombre del cliente]. Al conocer bien su proyecto me aseguro de que pague solo por lo que necesita: sin sobrantes, sin extras ocultos. ¿Me comparte las medidas o el plano si lo tiene? Le devuelvo una propuesta clara.',
      },
      {
        tipo: 'Breve',
        texto: '¿Me pasas las medidas o una foto del espacio, [nombre del cliente]? Con eso te armo la propuesta de [tipo de producto].',
      },
    ],
  },
  {
    id: 6,
    fase: 'Diagnóstico y cotización',
    titulo: 'Cotización enviada',
    descripcion: 'Entregar la propuesta explicando qué incluye y fijando expectativa de respuesta.',
    estadoCrm: 'COTIZANDO',
    momento: 'Inmediato tras enviar la cotización',
    tip: 'Adjunta fotos de obras similares terminadas — la evidencia visual mata la duda del precio.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], aquí está su cotización de [tipo de producto] por **[valor]**. Revísela con calma y me cuenta qué opina. Si hay algo que no le encaje — medidas, material o presupuesto — lo ajustamos. ¿Qué le parece?',
      },
      {
        tipo: 'Cercana',
        texto: '¡Listo [nombre del cliente]! 🎉 Le dejo su cotización de [tipo de producto] por **[valor]**. Ahí va todo incluido: fabricación, instalación y garantía. Mírela sin afán y me dice. Si algo se puede acomodar mejor, lo vemos juntos 😊',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], adjunto la cotización de su proyecto por un valor de **[valor]**. Incluye materiales certificados, instalación por personal propio y garantía de [X] años. La validez de la propuesta es de [X] días. Quedo atento a sus comentarios.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], su cotización de **[valor]** está lista. Un detalle que la respalda: incluye garantía real de [X] años — si algo presenta novedad, respondemos. Es la tranquilidad de saber que el precio cubre calidad de verdad. ¿La revisa?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], le comparto su cotización de [tipo de producto]: **[valor]**. Todo incluido. ¿Alguna duda?',
      },
    ],
  },
  {
    id: 7,
    fase: 'Diagnóstico y cotización',
    titulo: 'No respondió a la cotización (48–72h)',
    descripcion: 'Re-enganche con urgencia suave: motivo real (validez, proveedores) sin presionar.',
    estadoCrm: 'COTIZANDO / SEGUIMIENTO',
    momento: '48h después de enviar la cotización, 14:00–16:00',
    tip: 'La "urgencia suave" (ajuste de proveedores, validez limitada) funciona mejor que "¿ya la vio?" — da razón para actuar sin presión.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], ¿pudo revisar la cotización de su [tipo de producto]? Quiero asegurarme de que quedó clara y que se ajusta a lo que necesita. Si hay algo que no le convenció, es mejor saberlo para ajustarlo. ¿Me cuenta?',
      },
      {
        tipo: 'Cercana',
        texto: 'Hola [nombre del cliente] 👋, ¿qué tal? Le escribo solo para saber si alcanzó a mirar su cotización. Si la vio y tiene dudas, cuente conmigo. Y si está esperando comparar precios, también lo entiendo — aquí no lo voy a perseguir 😊',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], quiero verificar que haya recibido su cotización de [tipo de producto] del [día]. Si requiere alguna aclaración o ajuste, con gusto la atendemos. Asimismo, le informo que los valores pueden tener variación por actualización de proveedores.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], le escribo porque su cotización está vigente por pocos días más. Quiero que la decisión la tome con la información completa — si tiene preguntas sobre garantía, materiales o tiempos de entrega, estoy aquí para resolverlas. ¿En qué le puedo ayudar?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿alcanzó a revisar su cotización de [tipo de producto]? Le extiendo la validez unos días para que decida con calma.',
      },
    ],
  },
  {
    id: 8,
    fase: 'Diagnóstico y cotización',
    titulo: 'Ajustes a la cotización',
    descripcion: 'Cliente pidió cambios de medidas, material o acabados. Ajustar con opciones reales.',
    estadoCrm: 'COTIZANDO',
    momento: 'Respuesta inmediata',
    tip: 'Ajustar antes de fabricar evita costos sorpresa después — refuerza esa ventaja al cliente.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Claro, [nombre del cliente], con gusto ajustamos. ¿Qué cambio tenía en mente: medidas, material, acabado o presupuesto? Cuénteme la idea y le digo las opciones reales con sus valores, para que usted elija con información.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Claro que sí, [nombre del cliente]! 😊 Dígame qué le gustaría cambiar y le muevo lo que sea: el vidrio, el aluminio, las medidas… Nada es molestia — al final lo importante es que quede como usted lo sueña. ¿Qué ajustamos?',
      },
      {
        tipo: 'Formal',
        texto: 'Entendido, [nombre del cliente]. Procedo a ajustar la cotización según los cambios solicitados. Le informo que el nuevo valor dependerá de las especificaciones finales; en cuanto las confirme, le remito la propuesta actualizada a la brevedad.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Perfecto, [nombre del cliente]. Ajustar la cotización antes de fabricar es lo correcto — así evitamos costos sorpresa después. ¿Me confirma qué cambio exacto quiere (material, medida, cantidad)? Le preparo la versión nueva con su respectivo valor.',
      },
      {
        tipo: 'Breve',
        texto: 'Listo, [nombre del cliente]. ¿Qué ajustamos: medida, material o acabado? Me confirma y le envío la versión actualizada.',
      },
    ],
  },
  {
    id: 9,
    fase: 'Diagnóstico y cotización',
    titulo: 'Comparando con otro proveedor',
    descripcion: 'Cliente tiene otra cotización. Ayudar a comparar con hechos, nunca descalificar.',
    estadoCrm: 'COTIZANDO / SEGUIMIENTO',
    momento: 'Respuesta inmediata',
    tip: 'Nunca hables mal del competidor: pide su cotización y compara hechos (material, garantía, instalación). El que compara con datos confía más.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Le agradezco la transparencia, [nombre del cliente]. Comparar es lo más sano. Para ayudarle a comparar bien: ¿me comparte el valor que le ofrecieron y qué incluye exactamente? Así le aclaro en qué se diferencian (material, garantía, instalación) y usted decide con claridad.',
      },
      {
        tipo: 'Cercana',
        texto: 'Me parece perfecto que compare, [nombre del cliente] 😊 Así se asegura. Si me dice cuánto le están cobrando y qué les incluye, con mucho gusto le explico las diferencias con nuestra propuesta — sin decir mal de nadie, solo con hechos. ¿Le sirve?',
      },
      {
        tipo: 'Formal',
        texto: 'Entiendo que evalúe varias propuestas, [nombre del cliente]. Le sugiero verificar tres puntos al comparar: el material certificado, la garantía por escrito y si el valor incluye la instalación completa. Nuestra cotización de **[valor]** los cubre. ¿Desea que se los detalle?',
      },
      {
        tipo: 'Beneficio',
        texto: 'Comparar es buena decisión, [nombre del cliente]. Lo único que le pido es que compare lo mismo: nuestra propuesta incluye garantía de [X] años y personal propio de instalación — dos cosas que protegen su inversión a largo plazo. ¿Qué incluye la otra cotización en esos puntos?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], si está comparando, le ayudo a hacerlo bien: ¿qué incluye la otra propuesta? Material, garantía e instalación hacen la diferencia real en precio.',
      },
    ],
  },

  // ─── FASE 3 — VISITA TÉCNICA ────────────────────────────────────────────
  {
    id: 10,
    fase: 'Visita técnica',
    titulo: 'Coordinando visita técnica',
    descripcion: 'Agendar la toma de medidas en sitio — gratis, sin compromiso, para cotizar exacto.',
    estadoCrm: 'VISITA_TECNICA',
    momento: 'Lunes–viernes, 9:00–17:00',
    tip: 'Ofrece 2 opciones de día/hora ("¿lunes en la mañana o miércoles en la tarde?") — duplica la tasa de agendamiento.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], para dejarle una cotización precisa y sin sorpresas, lo ideal es tomar medidas en sitio — es gratis y sin compromiso. ¿Qué día y hora de esta semana le quedan bien? Prefiero [día] en la mañana o [día] en la tarde; usted me dice.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! ¿Le parece que pasemos a ver su espacio y tomar medidas? Es sin costo y no lo compromete a nada — solo para que su cotización quede exacta, ni de más ni de menos. ¿Cuándo le queda bien? 😊',
      },
      {
        tipo: 'Formal',
        texto: 'Para precisar su cotización de [tipo de producto], es necesario realizar una visita técnica al sitio. Esta es sin costo. Agradezco me confirme fecha y hora disponibles esta semana para coordinar con nuestro equipo técnico.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Una visita técnica nos evita dos cosas: que usted pague de más por medidas equivocadas y que haya retrasos después. Es gratis y con ella su cotización queda cerrada sin sorpresas. ¿Le agendo esta semana? Solo me dice el día.',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], para cotizarle exacto necesito tomar medidas en sitio (gratis). ¿Qué día de esta semana le sirve?',
      },
    ],
  },
  {
    id: 11,
    fase: 'Visita técnica',
    titulo: 'Recordatorio de visita',
    descripcion: 'Un día antes de la visita. Confirmar y reducir el ausentismo.',
    estadoCrm: 'VISITA_TECNICA',
    momento: '1 día antes, por la mañana',
    tip: 'Menciona el nombre del técnico — humaniza la visita y reduce el "no apareció nadie" por desconfianza.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], le confirmo la visita técnica de mañana [hora] en [dirección]. Estará [nombre del técnico] de nuestro equipo. Si algo cambió o prefiere reprogramar, avíseme sin problema. ¿Le sigue quedando bien?',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 👋 Solo confirmándole que mañana [hora] pasamos por su [tipo de producto] 😊 Estaremos [nombre del técnico]. Si necesita mover la hora, sin pena me avisa. ¡Nos vemos!',
      },
      {
        tipo: 'Formal',
        texto: 'Cordial recordatorio: mañana [hora] se realizará la visita técnica en [dirección] para la toma de medidas de su proyecto. Agradezco confirmar su disponibilidad. Cualquier novedad, quedo atento.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Mañana [hora] vamos a su espacio a tomar medidas — con eso su cotización queda exacta y sin costos sorpresa después. Ya tenemos su dirección: [dirección]. ¿Confirmado? Si tiene los planos o medidas anteriores, también nos sirven.',
      },
      {
        tipo: 'Breve',
        texto: 'Confirmando visita técnica mañana [hora] en [dirección]. ¿Ok? Si algo cambió, avíseme.',
      },
    ],
  },
  {
    id: 12,
    fase: 'Visita técnica',
    titulo: 'Post-visita técnica (24h después)',
    descripcion: 'Consolidar la confianza tras la visita y preparar la decisión. Actuar dentro de 24h.',
    estadoCrm: 'VISITA_TECNICA',
    momento: '24h post-visita, 10:00–12:00',
    tip: 'La visita es el momento de mayor confianza — actúa dentro de las 24h o la venta se enfría.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], espero la visita haya sido de su agrado. Ya con las medidas en mano, puedo prepararle su propuesta definitiva de [tipo de producto]. ¿Hay algo que le haya quedado dudando o que quiera que tenga en cuenta? Le escucho antes de cotizar.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 🙌 Ya pasamos por su espacio y todo quedó medido. Ahora déjeme armarle la propuesta como Dios manda. ¿Le quedó alguna inquietud de la visita o todo claro? Me cuenta y le preparo algo pensado para usted.',
      },
      {
        tipo: 'Formal',
        texto: 'Con la información de la visita técnica, procederé a elaborar la propuesta definitiva de su proyecto de [tipo de producto]. Si considera algún ajuste adicional, le agradezco indicármelo antes de la emisión para que el documento quede completo.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Su visita quedó registrada y ahora su cotización será exacta — sin costos ocultos ni ajustes sorpresa. En máximo [X] horas le comparto la propuesta final con garantía de [X] años incluida. ¿Le pareció bien el espacio para lo que necesita?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ya tengo sus medidas. Le preparo la propuesta de [tipo de producto] hoy. ¿Algún ajuste que quiera tener en cuenta?',
      },
    ],
  },

  // ─── FASE 4 — SEGUIMIENTO Y CIERRE ──────────────────────────────────────
  {
    id: 13,
    fase: 'Seguimiento y cierre',
    titulo: 'Seguimiento sin presión (cliente indeciso)',
    descripcion: 'Cliente indeciso. Reafirmar confianza y abrir espacio para dudas, sin insistir.',
    estadoCrm: 'SEGUIMIENTO',
    momento: 'Cada 3–4 días, 10:00–12:00',
    tip: 'El indeciso no necesita más ofertas: necesita que le ayuden a resolver sus dudas. Pregunta qué le frena, no insistas en que compre.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], solo paso a saludarlo y ver cómo va con el tema de su [tipo de producto]. Entiendo que estas decisiones toman tiempo — ¿hay algo que le genere duda o alguna información que le haga falta para decidir? Estoy para ayudarle, no para apurarle.',
      },
      {
        tipo: 'Cercana',
        texto: 'Hola [nombre del cliente] 👋, ¿cómo va todo? Le escribo sin afán — sé que hay mil cosas en la cabeza. Si en algún momento quiere retomar lo de su [tipo de producto], aquí sigo con la mejor disposición. ¿Alguna duda que le ronde?',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], le escribo para saber si su propuesta de [tipo de producto] se ajusta a sus expectativas. Si requiere información adicional para su análisis, con gusto se la facilito. No hay compromiso alguno por mi parte.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], pensaba en usted: su cotización incluye garantía de [X] años y material certificado — protección para su inversión a largo plazo, no solo para hoy. Si quiere, le explico con calma cómo funciona la garantía y qué cubre. ¿Le interesa?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], paso a ver cómo va. ¿Necesita algo de mi parte para su decisión? Estoy disponible.',
      },
    ],
  },
  {
    id: 14,
    fase: 'Seguimiento y cierre',
    titulo: 'Cierre / aprobación (técnica de alternativa)',
    descripcion: 'Momento de pedir la decisión con opciones de fecha — nunca "¿desea comprar?"',
    estadoCrm: 'SEGUIMIENTO → APROBADO',
    momento: '3 días post-cotización, martes–jueves 10:00–11:00',
    tip: 'Nunca preguntes "¿desea comprar?" — pregunta cuándo. El cierre con alternativa obliga a decidir.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], su proyecto de [tipo de producto] está listo para arrancar. Le tengo dos opciones de instalación: **[semana 1] o [semana 2]**. ¿Cuál le acomoda mejor? Con su confirmación coordino la producción para esa fecha.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 🗓️ Ya tengo cupo en taller para su [tipo de producto]. ¿Le queda mejor la próxima semana o dentro de dos? Me confirma y yo me encargo de todo el resto 😊',
      },
      {
        tipo: 'Formal',
        texto: 'Para dar inicio a la fabricación de su proyecto, agradezco confirmar la aprobación de la propuesta por valor de **[valor]**. Una vez confirmada, agendo la producción con un plazo de entrega de [X] días y coordino la instalación. ¿Procedemos?',
      },
      {
        tipo: 'Beneficio',
        texto: 'Su [tipo de producto] ya tiene medidas, cotización y garantía aprobada por nosotros. Lo único que falta es su confirmación para reservar el cupo de producción de la próxima semana — después de eso, usted solo recibe la obra terminada e instalada. ¿Lo aseguramos?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿aprobamos la cotización de **[valor]**? Tengo cupo de producción para [fecha]. Solo su confirmación y arrancamos.',
      },
    ],
  },
  {
    id: 15,
    fase: 'Seguimiento y cierre',
    titulo: 'Objeción de precio',
    descripcion: '"Está caro" o pide descuento. Reencuadrar valor primero; ofrecer alternativa, nunca descuento directo.',
    estadoCrm: 'COTIZANDO / SEGUIMIENTO',
    momento: 'Respuesta inmediata (máx 2h)',
    tip: 'Nunca bajes el precio al primer "está caro": primero justifica valor (garantía, calidad, instalación), luego ofrece alternativa — nunca descuento directo.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Entiendo, [nombre del cliente], y respeto que el presupuesto sea un punto importante. Para ver si podemos encontrar un punto medio: ¿qué rango de presupuesto tiene en mente? Con eso le propongo opciones reales de [material/medida] que se ajusten, sin bajar la calidad que su proyecto necesita.',
      },
      {
        tipo: 'Cercana',
        texto: 'Es totalmente válido, [nombre del cliente] 😊 El precio merece una conversación honesta. Le cuento qué hay detrás: material certificado y garantía real, para que no salga más caro después. ¿Me dice qué presupuesto maneja y le busco una alternativa a la medida?',
      },
      {
        tipo: 'Formal',
        texto: 'Comprendo su observación sobre el valor. Le aclaro que la cotización de **[valor]** incluye material certificado, mano de obra propia y garantía de [X] años. Si su presupuesto es inferior, puedo estructurar una propuesta alternativa con especificaciones ajustadas. ¿Le interesa?',
      },
      {
        tipo: 'Beneficio',
        texto: '[nombre del cliente], más que el precio inicial, vale la pena mirar el costo a largo plazo: un material de menor calidad se paga dos veces. Nuestra propuesta incluye garantía de [X] años — si algo falla, respondemos. Si quiere, le muestro una alternativa de [alternativa] que baje el valor sin sacrificar lo esencial.',
      },
      {
        tipo: 'Breve',
        texto: 'Entiendo, [nombre del cliente]. ¿Qué presupuesto maneja? Le armo una opción ajustada y le explico qué se puede cambiar sin perder calidad.',
      },
    ],
  },
  {
    id: 16,
    fase: 'Seguimiento y cierre',
    titulo: 'Objeción de tiempo ("ahora no")',
    descripcion: 'Cliente que pospone. Entender el porqué y ofrecer flexibilidad (abono inicial, reserva de precio).',
    estadoCrm: 'SEGUIMIENTO',
    momento: 'Respuesta inmediata',
    tip: 'Cuando el cliente dice "ahora no", casi siempre hay un motivo oculto (presupuesto, otra prioridad). Pregunta el porqué antes de ofrecer soluciones.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Lo entiendo perfectamente, [nombre del cliente]. ¿Le puedo preguntar qué es lo que está esperando para arrancar? Si es el presupuesto, los tiempos o un tema de obra, tal vez pueda ayudarle con una alternativa que se ajuste a su momento.',
      },
      {
        tipo: 'Cercana',
        texto: 'Tranquilo, [nombre del cliente], no hay afán 😊 Solo por curiosidad, ¿qué le tiene frenado el proyecto? A veces con organizar el arranque en dos etapas o con un abono inicial, se facilita. ¿Le cuento cómo funciona?',
      },
      {
        tipo: 'Formal',
        texto: 'Entiendo que el momento no sea el adecuado. Para su tranquilidad, le informo que la propuesta de [tipo de producto] puede retomarse cuando usted lo considere; los valores podrían variar según actualizaciones de proveedores. ¿Desea que la mantenga en espera o la deje archivada?',
      },
      {
        tipo: 'Beneficio',
        texto: 'Sin problema, [nombre del cliente]. Algo que le puede convenir: si confirmamos la cotización ahora, le bloqueo el precio actual de **[valor]** y programamos la instalación para cuando usted lo necesite. Así el proyecto no se encarece mientras usted espera. ¿Le parece útil?',
      },
      {
        tipo: 'Breve',
        texto: 'Entendido, [nombre del cliente]. ¿Le agendo un recordatorio para retomarlo en [mes]? Así no pierde la cotización.',
      },
    ],
  },

  // ─── FASE 5 — POSTVENTA Y REACTIVACIÓN ──────────────────────────────────
  {
    id: 17,
    fase: 'Postventa y reactivación',
    titulo: 'Reactivar lead frío (+15 días)',
    descripcion: 'Lead sin contacto hace +15 días. Excusa natural para reaparecer sin presión.',
    estadoCrm: 'FRIO',
    momento: 'Miércoles–viernes, 16:00–18:00',
    tip: 'La excusa de actualización de valores o promoción es la puerta de entrada natural — nunca digas "¿por qué nunca respondió?"',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], soy [tu nombre] de Vidrios Templex — cotizamos su [tipo de producto] hace un tiempo. ¿Cómo va ese proyecto? Si sigue en pie, con gusto actualizamos la cotización con los valores de hoy. Y si ya lo resolvió con otro, le deseo lo mejor. ¿Qué me cuenta?',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 👋 Me acordé de usted hoy. ¿Qué pasó con su [tipo de producto]? Sin compromiso, solo quería saber si sigue en pie para ayudarle si lo necesita. ¡Espero que todo vaya bien!',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], le saluda [tu nombre] de Vidrios Templex. En su momento elaboramos una cotización de [tipo de producto] para su proyecto. Si el proyecto sigue vigente, con gusto le actualizo las condiciones actuales. Quedo atento.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], le escribo porque los valores de [material] cambiaron y quiero que tenga la información vigente antes de decidir. Si su proyecto sigue adelante, le reemito su cotización actualizada de [tipo de producto]. ¿Le interesa?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿sigue en pie lo de su [tipo de producto]? Si sí, le actualizo la cotización. Si no, quedamos en contacto.',
      },
    ],
  },
  {
    id: 18,
    fase: 'Postventa y reactivación',
    titulo: 'Pedido aprobado — próximos pasos',
    descripcion: 'Cliente aprobó. Confirmar, explicar el proceso y dar tranquilidad total.',
    estadoCrm: 'APROBADO',
    momento: 'Inmediato a la aprobación',
    tip: 'Este mensaje reduce las llamadas de "¿cómo va mi pedido?" — explicar el proceso y prometer avisos genera calma.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: '¡Excelente decisión, [nombre del cliente]! 🎉 Su pedido de [tipo de producto] entró a producción. El proceso será: fabricación ([X] días) → instalación ([fecha] o lo coordinamos). ¿Le gustaría que le avise en cada paso o prefiere solo la confirmación final?',
      },
      {
        tipo: 'Cercana',
        texto: '¡Felicitaciones, [nombre del cliente]! 🥳 Su proyecto ya está en marcha. Yo le voy informando cómo va todo para que esté tranquilo. Si en algún momento tiene dudas, aquí estoy. ¡Está en buenas manos!',
      },
      {
        tipo: 'Formal',
        texto: 'Confirmamos su pedido de [tipo de producto] por valor de **[valor]**. El tiempo estimado de fabricación es de [X] días, seguido de la instalación en sitio. Nuestro equipo le notificará los avances. Agradecemos su confianza en Vidrios Templex.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Su [tipo de producto] ya está en producción con garantía de [X] años respaldándolo. A partir de ahora usted no tiene que preocuparse por nada: nosotros fabricamos, entregamos e instalamos. Le avisamos cuando esté listo. ¡Gracias por confiar en nosotros!',
      },
      {
        tipo: 'Breve',
        texto: '¡Confirmado, [nombre del cliente]! 🎉 Su [tipo de producto] entró a producción. Le aviso cuando esté listo para instalar.',
      },
    ],
  },
  {
    id: 19,
    fase: 'Postventa y reactivación',
    titulo: 'Postventa — satisfacción',
    descripcion: 'Días después de instalar. Cuidar la relación y abrir la puerta a futuros proyectos.',
    estadoCrm: 'APROBADO',
    momento: '3–5 días post-instalación',
    tip: 'La postventa es la semilla del referido: un cliente cuidado vuelve y recomienda. Pregunta por su experiencia real.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], ¿cómo va todo con su [tipo de producto]? Llevamos [X] días de la instalación y quiero saber si todo quedó como esperaba. ¿Algo que le haya gustado especialmente o algo que pudiéramos mejorar? Sus comentarios nos ayudan a ser mejores.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 👋 ¿Cómo le fue con su [tipo de producto]? Ojalá todo haya quedado como lo imaginó. Si necesita cualquier cosa —un ajuste, una recomendación— aquí estoy. ¡Fue un gusto trabajar para usted!',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], esperamos que su [tipo de producto] esté cumpliendo con sus expectativas. Quedamos a su disposición para cualquier novedad durante el período de garantía. Su opinión es valiosa para nuestro servicio.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Hola [nombre del cliente], su garantía de [X] años ya está activa. Si en cualquier momento nota algo en su [tipo de producto], escríbanos y respondemos. Mientras tanto, disfrútelo — fue hecho para durar. ¿Cómo le pareció todo el proceso?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿todo bien con su [tipo de producto]? Cualquier cosa, aquí estoy.',
      },
    ],
  },
  {
    id: 20,
    fase: 'Postventa y reactivación',
    titulo: 'Solicitar referidos',
    descripcion: 'Cliente satisfecho. Pedir recomendación de forma natural y sin presión.',
    estadoCrm: 'APROBADO',
    momento: '1–2 semanas post-instalación',
    tip: 'El referido es el canal más barato y confiable — pide la recomendación con naturalidad, ofreciendo atender igual de bien.',
    mensajes: [
      {
        tipo: 'Consultiva',
        texto: 'Hola [nombre del cliente], me alegra que su [tipo de producto] haya quedado bien. Como conoce nuestro trabajo de primera mano: ¿conoce a alguien — familia, amigo o colega — que esté pensando en vidrio o aluminio? Con gusto los asesoro con el mismo cuidado.',
      },
      {
        tipo: 'Cercana',
        texto: '¡Hola [nombre del cliente]! 😊 Como quedó contento con su [tipo de producto], le pregunto: ¿tiene algún conocido que esté pensando en hacer uno similar? Si me lo recomienda, lo atiendo con el mismo cariño. ¡Las recomendaciones son nuestro mejor premio!',
      },
      {
        tipo: 'Formal',
        texto: 'Hola [nombre del cliente], nos alegra su satisfacción con el trabajo realizado. Si conoce a alguna persona o empresa que requiera soluciones en vidrio y aluminio, le agradeceríamos recomendarnos. Su referencia es la mejor garantía de nuestro servicio.',
      },
      {
        tipo: 'Beneficio',
        texto: 'Su proyecto quedó respaldado por nuestra garantía de [X] años, y lo mismo ofrecemos a quien usted nos refiera: asesoría sin costo y medición en sitio. Si me pasa un contacto interesado en [tipo de producto], lo atiendo con prioridad. ¿Le parece?',
      },
      {
        tipo: 'Breve',
        texto: 'Hola [nombre del cliente], ¿todo bien? Si conoce a alguien que necesite [tipo de producto], mándelo — lo atendemos con el mismo cuidado que a usted. 😊',
      },
    ],
  },
];