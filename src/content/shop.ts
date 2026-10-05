// Shop-site prices, inventories, discounts, and reroll rules.

export const SHOP = {
  prices: {
    standardCard: 100,
    specialtyCard: 200,
    dreamsign: 50,
  },
  stock: {
    cardShop: {
      cardSlots: 5,
      dreamsignSlots: 0,
    },
    specialtyShop: {
      cardSlots: 5,
      dreamsignSlots: 0,
    },
    dreamsignBazaar: {
      cardSlots: 0,
      dreamsignSlots: 3,
    },
  },
  discounts: {
    // Relative weights select how many generated offers receive a discount.
    slotCounts: [
      {
        value: 1,
        weight: 1,
      },
      {
        value: 2,
        weight: 1,
      },
    ],
    percentages: [
      {
        value: 30,
        weight: 1,
      },
      {
        value: 40,
        weight: 1,
      },
      {
        value: 50,
        weight: 1,
      },
      {
        value: 60,
        weight: 1,
      },
      {
        value: 70,
        weight: 1,
      },
      {
        value: 80,
        weight: 1,
      },
      {
        value: 90,
        weight: 1,
      },
    ],
  },
  reroll: {
    standardPrice: 50,
    enhancedPrice: 0,
    maxPerVisit: 1,
  },
};
