import { defineConfig } from "vite";

const dateSafetyScript = `<script>
(() => {
  const isInvalid = (value) => Number.isNaN(value.getTime());
  const toLocaleDateString = Date.prototype.toLocaleDateString;
  const toISOString = Date.prototype.toISOString;
  Date.prototype.toLocaleDateString = function (...args) {
    return isInvalid(this) ? "—" : toLocaleDateString.call(this, ...args);
  };
  Date.prototype.toISOString = function () {
    return isInvalid(this) ? "" : toISOString.call(this);
  };
})();
<\/script>`;

export default defineConfig({
  plugins: [{
    name: "passbook-date-safety",
    transformIndexHtml(html) {
      return html.replace(
        '<script type="module" src="/src/main.jsx"></script>',
        `${dateSafetyScript}\n    <script type="module" src="/src/main.jsx"></script>`
      );
    },
  }],
});
