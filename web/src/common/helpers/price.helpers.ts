export const formatPrice = (bani: number) => {
  return new Intl.NumberFormat("ro-Ro", {
    style: "currency",
    currency: "RON",
  }).format(bani / 100);
};
