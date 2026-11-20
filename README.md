# Toltén Fishing Tours

Sitio de pesca guiada en el río Toltén (Astro + GSAP + Three.js + Lenis).

## Correr en local
npm install
npm run dev
Abrir http://localhost:4321

## Editar contenido (src/data)
- programas.json: programas, precios, qué incluye
- salidas.json: próximas salidas y cupos (las pasadas se ocultan solas)
- especies.json: fichas de trucha arcoíris, café y chinook, foto de cada pez y su tamaño relativo (tam)
- faq.json: preguntas frecuentes
- sitio.json: WhatsApp, Instagram, temporada, punto de encuentro, tienda aliada
- rio-tolten.json: curso real del Toltén, Allipén, Donguil, costa y lago Villarrica (OpenStreetMap)

## Cómo funcionan los peces (src/lib/rio.ts)
Cada pez es una foto real recortada (public/img/peces/*.webp) montada en una malla que se dobla
con una onda de nado, de la cabeza a la cola. El archivo *-alto.png es el mapa de grosor del cuerpo:
le da volumen y luz a la foto. Arriba de la línea de agua se ve una foto real del Toltén.

Para cambiar un pez: reemplaza la foto por otra con fondo transparente, cabeza hacia la derecha,
y genera su mapa de grosor (cuerpo blanco al centro, aletas casi negras).

## Créditos de imágenes
- Trucha arcoíris, trucha café y salmón chinook: Wikimedia Commons, dominio público (USFWS, U.S. FDA)
- Río Toltén, puente Leufulafquén: Falk2, CC BY-SA 4.0. Panorámica del río Toltén: Maxbalter, CC BY-SA 3.0
- Mapa: © colaboradores de OpenStreetMap (ODbL)
