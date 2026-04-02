const MODULE_ID = "rogue-sneak-checkbox";

/**
 * Retourne le nombre de d6 d'attaque sournoise selon le niveau de roublard.
 * D&D 5e : 1d6 au niveau 1, puis +1d6 tous les 2 niveaux.
 */
function getSneakAttackDice(actor) {
  const rogueClass = actor.items.find(i =>
    i.type === "class" &&
    i.name?.toLowerCase().includes("roublard")
  );

  const levels = Number(rogueClass?.system?.levels ?? 0);
  if (!levels) return 0;

  return Math.ceil(levels / 2);
}

/**
 * Vérifie juste que l'acteur a des niveaux de roublard.
 */
function isRogue(actor) {
  return getSneakAttackDice(actor) > 0;
}

/**
 * On stocke le choix temporairement sur l'item, uniquement pendant le jet.
 * C'est volontairement simple.
 */
function setPendingSneak(item, value) {
  item.setFlag(MODULE_ID, "pendingSneakAttack", value);
}

async function getPendingSneak(item) {
  return item.getFlag(MODULE_ID, "pendingSneakAttack");
}

async function clearPendingSneak(item) {
  await item.unsetFlag(MODULE_ID, "pendingSneakAttack");
}

/**
 * Injection de la case dans le dialogue de configuration de jet.
 *
 * IMPORTANT :
 * Selon ta version exacte de dnd5e / Midi, le nom exact du hook ou la structure
 * HTML peut demander un petit ajustement.
 */
Hooks.on("renderDialog", async (app, html, data) => {
  try {
    // On essaie de repérer un dialogue de roll config d'attaque dnd5e.
    const title = app.title?.toLowerCase?.() ?? "";
    if (!title.includes("attaque") && !title.includes("attack")) return;

    // Trouver l'acteur/item à partir du contexte du dialogue peut varier selon version.
    // On tente quelques chemins courants :
    const item = app?.object ?? app?.options?.item ?? null;
    const actor = item?.actor ?? app?.options?.actor ?? null;

    if (!actor || !item) return;
    if (!isRogue(actor)) return;

    // Évite de dupliquer la case si le dialogue rerender.
    if (html.find(`.form-group[data-${MODULE_ID}="sneak"]`).length) return;

    const dice = getSneakAttackDice(actor);

    const block = $(`
      <div class="form-group" data-${MODULE_ID}="sneak">
        <label>Attaque sournoise</label>
        <div class="form-fields">
          <input type="checkbox" name="useSneakAttack" />
          <span class="hint">${dice}d6 supplémentaires</span>
        </div>
      </div>
    `);

    // On l'ajoute à la fin du formulaire.
    const form = html.find("form");
    if (!form.length) return;
    form.append(block);

    // Capture du submit du dialogue
    form.on("submit", async function () {
      const checked = html.find('input[name="useSneakAttack"]').is(":checked");
      await setPendingSneak(item, checked);
    });
  } catch (err) {
    console.error(`${MODULE_ID} | Erreur renderDialog`, err);
  }
});

/**
 * Au moment du jet de dégâts, si la case a été cochée :
 * - on récupère le niveau de roublard
 * - on ajoute Xd6
 * - on gère le critique
 */
Hooks.on("midi-qol.preDamageRoll", async (workflow) => {
  try {
    const actor = workflow?.actor;
    const item = workflow?.item;
    if (!actor || !item) return true;

    const useSneak = await getPendingSneak(item);
    if (!useSneak) return true;

    const dice = getSneakAttackDice(actor);
    if (!dice) {
      await clearPendingSneak(item);
      return true;
    }

    const totalDice = workflow.isCritical ? dice * 2 : dice;
    const formula = `${totalDice}d6`;

    const sneakRoll = await (new Roll(formula)).evaluate();

    if (workflow.bonusDamageRoll) {
      const combined = await (new Roll(`${workflow.bonusDamageRoll.formula} + ${formula}`)).evaluate();
      workflow.bonusDamageRoll = combined;
    } else {
      workflow.bonusDamageRoll = sneakRoll;
    }

    workflow.bonusDamageFlavor = [
      workflow.bonusDamageFlavor,
      "Attaque sournoise"
    ].filter(Boolean).join(" + ");

    await clearPendingSneak(item);

    ui.notifications.info(`${actor.name} applique Attaque sournoise (${formula}).`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Erreur preDamageRoll`, err);
    return true;
  }
});

/**
 * Nettoyage de sécurité si un workflow s'interrompt.
 */
Hooks.on("midi-qol.RollComplete", async (workflow) => {
  try {
    if (workflow?.item) await clearPendingSneak(workflow.item);
  } catch (err) {
    console.error(`${MODULE_ID} | Erreur RollComplete`, err);
  }
});
