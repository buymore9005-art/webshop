import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [{
        name: 'bundled-label-rasters',
        enforce: 'pre',
        load(id) {
            // Vite 5 does not support the newer asset ?inline query.
            if (!/\/src\/assets\/couriers\/[^/]+\.(png|webp)\?inline$/.test(id.replaceAll('\\', '/'))) return;
            const file = id.slice(0, -7);
            const mime = file.endsWith('.png') ? 'png' : 'webp';
            return `export default ${JSON.stringify(`data:image/${mime};base64,${readFileSync(file).toString('base64')}`)}`;
        },
    }, react()],
});
