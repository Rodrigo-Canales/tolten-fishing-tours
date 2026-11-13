# Toltén Fishing Tours

Sitio de pesca guiada (Astro + GSAP + Three.js + Lenis).

## Correr en local
npm install
npm run dev
Abrir http://localhost:4321

## Editar contenido (src/data)
- programas.json: programas, precios, qué incluye
- salidas.json: próximas salidas y cupos (las pasadas se ocultan solas)
- especies.json: fichas de trucha arcoíris, café y chinook
- faq.json: preguntas frecuentes
- sitio.json: WhatsApp, Instagram, temporada, punto de encuentro, tienda aliada

## Modelos 3D reales de los peces
Por defecto se dibuja un pez procedural. Para usar un modelo real:
1. Copia el .glb en public/modelos/ (ej: public/modelos/arcoiris.glb)
2. En src/data/especies.json pon "archivo": "/modelos/arcoiris.glb" en la especie
3. Si el pez queda mirando al revés usa "girar": 3.1416. Si queda de cabeza, "inclinar": 3.1416
El modelo se centra, se escala y nada solo. Si el .glb trae animación propia, se usa esa.
