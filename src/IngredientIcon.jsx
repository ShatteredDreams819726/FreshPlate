import { ingredientIcon } from './ingredientPresentation.js';
export default function IngredientIcon({ state, ingredientId }) {
  const icon = ingredientIcon(state, ingredientId);
  return <span className={`ingredient-art ${icon.color}`} aria-hidden="true">{icon.image ? <img src={icon.image} alt="" /> : icon.symbol}</span>;
}
