// Teléfonos para `wa.me` y `tel:`. Compartido por Cotizador (enviar la propuesta)
// e Instalaciones (contactar a quien recibe en la obra).

/** Teléfono para `wa.me`: solo dígitos, con el 57 de Colombia si viene un
 * celular de 10 cifras sin indicativo. Vacío si no hay número utilizable. */
export function telefonoWhatsApp(telefono: string | null | undefined): string {
    const digitos = String(telefono ?? '').replace(/\D/g, '');
    if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
    return digitos.length >= 10 ? digitos : '';
}

/** Primer número de un campo que puede traer varios ("300 123 4567 / 310 987 6543").
 * Sin esto, `telefonoWhatsApp` uniría los dígitos de ambos en un número inválido. */
export function primerTelefono(telefono: string | null | undefined): string {
    return String(telefono ?? '').split(/[/,;|]|\s-\s|\sy\s|\so\s/i)[0].trim();
}

/** Celular colombiano listo para `wa.me` (57 + 10 cifras que empiezan por 3), o
 * vacío. A diferencia de `telefonoWhatsApp`, rechaza los fijos (60X…): WhatsApp
 * no los abre y el botón solo confundiría en terreno. */
export function celularWhatsApp(telefono: string | null | undefined): string {
    const digitos = primerTelefono(telefono).replace(/\D/g, '');
    if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
    if (digitos.length === 12 && digitos.startsWith('573')) return digitos;
    return '';
}

/** Abre WhatsApp con el mensaje listo. Llamar directo desde el clic: si va
 * después de un `await`, el navegador bloquea la ventana. */
export function abrirChatWhatsApp(telefonoWa: string, mensaje: string): void {
    window.open(`https://wa.me/${telefonoWa}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
}
