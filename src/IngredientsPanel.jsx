import { useRef, useState } from 'react';
import IngredientIcon from './IngredientIcon.jsx';
import { ingredientReview } from './ingredientPresentation.js';
import { prepareIngredientImage } from './ingredientImages.js';

function ImageControl({ item, demo }) {
  const input = useRef(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function selectImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const image = await prepareIngredientImage(file);
      if (!demo.run({ type: 'SET_INGREDIENT_ICON', ingredientId: item.id, image })) setError('Image was not saved. Your previous icon is unchanged. Review the storage message above and retry.');
    } catch (failure) { setError(`Image was not saved. ${failure.message}`); }
    finally { setBusy(false); }
  }
  return <div className="ingredient-image-control"><input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={selectImage} aria-label={`Choose icon for ${item.name}`} /><button type="button" className="secondary-button" disabled={busy || demo.blocked} onClick={() => input.current.click()}>{busy ? 'Preparing image…' : demo.state.ingredientIcons?.[item.id] ? 'Replace Image' : 'Upload Image'}</button>{demo.state.ingredientIcons?.[item.id] && <button type="button" className="secondary-button" disabled={busy || demo.blocked} onClick={() => demo.run({ type: 'SET_INGREDIENT_ICON', ingredientId: item.id, image: null })}>Use Default</button>}{error && <p role="alert" className="input-error">{error}</p>}</div>;
}

export default function IngredientsPanel({ demo }) {
  const { state } = demo, reviews = ingredientReview(state);
  return <details className="detail-panel"><summary>Ingredients ({state.ingredients.length})</summary><p>JPG or PNG, up to 2 MB. Images are resized to at most 128 × 128 pixels and saved in this browser. Save a new ingredient first, then add its image here.</p><ul className="ingredient-catalog">{state.ingredients.map(item => <li key={item.id}><div className="ingredient"><IngredientIcon state={state} ingredientId={item.id} /><strong>{item.name} · {item.unit}</strong></div><ImageControl item={item} demo={demo} /></li>)}</ul>{reviews.length > 0 && <details className="detail-panel"><summary>Review similar ingredient names ({reviews.length})</summary><p>These are separate ingredients. Nothing has been merged or reassigned. Review which ingredient your batches and recipes should use.</p>{reviews.map((review, index) => <div key={index}><ul>{review.candidates.map(item => <li key={item.id}>{item.name} · {item.unit}: {item.batches} batches, {item.recipes} recipes, {item.plans} saved plans referencing this ingredient.</li>)}</ul></div>)}</details>}</details>;
}
