Hooks.once("ready", () => {
  ui.notifications.info("Module Attaque Sournoise chargé !");
  console.log("rogue-sneak-checkbox | module chargé");
});

Hooks.on("renderDialog", (app, html) => {
  console.log("rogue-sneak-checkbox | renderDialog détecté", app.title);
});
