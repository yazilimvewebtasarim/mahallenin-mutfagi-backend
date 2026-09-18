const express = require('express');
const router = express.Router();

router.post('/detect-allergens', (req, res) => {
  const { ingredients } = req.body;
  if (!ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'Ingredients must be an array' });
  }

  const allergens = [];
  const lowerIngredients = ingredients.map(i => typeof i === 'string' ? i.toLowerCase() : '');
  
  if (lowerIngredients.includes('peanut') || lowerIngredients.includes('peanuts')) allergens.push('Peanuts');
  if (lowerIngredients.includes('milk') || lowerIngredients.includes('cheese')) allergens.push('Dairy');
  if (lowerIngredients.includes('wheat') || lowerIngredients.includes('flour')) allergens.push('Gluten');

  return res.status(200).json({ allergens });
});

router.get('/food-suggestions', (req, res) => {
  const suggestions = [
    { id: 1, name: 'Vegan Salad', matchScore: 0.95 },
    { id: 2, name: 'Grilled Chicken', matchScore: 0.85 }
  ];
  return res.status(200).json({ suggestions });
});

router.get('/menu-suggestions', (req, res) => {
  const suggestions = [
    { id: 1, menu: 'Healthy Breakfast Combo', matchScore: 0.98 },
    { id: 2, menu: 'Protein Lunch', matchScore: 0.88 }
  ];
  return res.status(200).json({ suggestions });
});

module.exports = router;
