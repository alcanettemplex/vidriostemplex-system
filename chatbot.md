# Documentación de Idea: Agente de IA para Captura de Leads (WhatsApp)

## 1. Resumen Ejecutivo
El objetivo de este proyecto es automatizar y reemplazar la función actual del Asistente Administrativo en la recepción y captura de leads provenientes de WhatsApp. Se desarrollará un **Agente de IA** que será capaz de mantener una conversación inicial, extraer los requerimientos del cliente, llenar automáticamente el formulario de "Captura de Nuevo Lead" y asignar el prospecto al asesor correspondiente de manera inteligente.

Toda la gestión se realizará dentro de una nueva pestaña en el módulo de **CRM & Leads**, la cual tendrá una interfaz similar a WhatsApp Web para facilitar el monitoreo, seguimiento y, si es necesario, la intervención humana.

## 2. Arquitectura y Tecnologías
* **Conexión con WhatsApp:** Se utilizará la **API Oficial de WhatsApp Cloud (Meta)**, garantizando la seguridad de la línea telefónica empresarial y estabilidad a largo plazo.
* **Frontend (UI/UX):** Nueva pestaña en el CRM simulando la vista de WhatsApp Web.
* **Cerebro (IA):** Modelo LLM (ej. GPT-4o o Claude) con un *System Prompt* robusto para definir estrictamente su rol y límites.
* **Almacenamiento de Multimedia:** Servicio de almacenamiento en la nube/backend para procesar y guardar las imágenes enviadas por los clientes.

## 3. Rol y Personalidad del Agente (El "Prompt")
* **Identidad Empática:** El asistente deberá responder de forma humana, cercana, profesional y persuasiva, buscando que el cliente no perciba que está interactuando con una inteligencia artificial.
* **Límites Estrictos de Acción:** 
  * **PERMITIDO:** Saludar cálidamente, perfilar al cliente, pedir nombre, consultar necesidades, captar requerimientos técnicos, solicitar imágenes y descubrir la intención de compra.
  * **NO PERMITIDO:** Hacer cotizaciones, dar precios o tomar decisiones operativas. El Agente tiene estrictamente prohibido cotizar; su objetivo único es preparar un expediente perfecto para que el Asesor Humano realice la venta.

## 4. Flujo Operativo y de Asignación Inteligente
1. **Interacción:** El cliente escribe por WhatsApp; la IA toma el control y responde guiando la conversación amigablemente para obtener los datos requeridos.
2. **Procesamiento Multimedia:** Si el cliente envía imágenes (ej. fotos del lugar, planos, medidas), la IA las detecta, descarga y adjunta automáticamente al formulario del Lead (límite de 5 imágenes actuales en el sistema).
3. **Captura de Datos:** Una vez obtenida la información clave, la IA estructura los datos (Nombre, Teléfono, Producto, Segmento, Fuente, Descripción).
4. **Asignación Equitativa:** La IA consulta la base de datos de los asesores. En lugar de dejar el lead en la Bolsa Común, la IA evalúa la carga de trabajo y asigna el prospecto al asesor que tenga **menor cantidad de leads activos** (sumando los que están en estado "Asignado" y "En Contacto").

## 5. UI: Sub-pestañas de Gestión (Dashboard de Control en CRM)
Dentro del módulo CRM & Leads, se agregará un entorno similar a WhatsApp Web con las siguientes secciones:
1. **🤖 Atendidos por IA:** Visualización en tiempo real de los chats que la IA está gestionando. (Solo lectura para supervisión).
2. **🙋 Intervención Humana (Handoff):** Si la IA detecta fricción, el cliente exige ayuda humana, o el caso es demasiado complejo, el chat pasa a esta pestaña alertando al equipo para un relevo silencioso. El usuario humano toma el control desde la interfaz del CRM.
3. **✅ Leads Capturados:** Historial de conversaciones finalizadas y convertidas exitosamente en leads asignados.
4. **⚙️ Configuración del Agente:** Panel administrativo para ajustar reglas de asignación, el tono de voz de la IA (prompts) y habilitar/deshabilitar la automatización.

## 6. Catálogo de Conocimiento (Productos y Servicios)
El bot debe estar contextualmente programado con el catálogo real de la empresa para identificar si el requerimiento del cliente está dentro de lo que se comercializa.

**Categorías Principales:**
* **Tipos de Vidrio:** Vidrio Templado, Vidrio Laminado, Vidrio Crudo.
* **Aplicaciones y Estructuras:** Cabinas de Baño, Vidrios para piso, Espejos, Pasamanos, Pérgolas, Fachadas, Divisiones de oficina, Tableros.
* **Puertas y Ventanas:** Puertas batientes, Puertas corredizas, Puertas de aluminio, Puertas vidrieras, Ventanería general / Ventanas de aluminio.
* **Complementos:** Películas de control solar.
* **Servicios Especializados:** Mantenimiento, Instalación, Reposición de vidrios, Desmontaje y montaje de pisos/estructuras para mantenimiento.

**Regla de Fuera de Alcance:** Si un cliente solicita un producto o servicio que no pertenezca directa o indirectamente a este catálogo, la IA debe responder amablemente informando que la empresa no maneja dicha línea y derivar la consulta a la pestaña de *Intervención Humana* si el cliente insiste.
