"use client";

import { useEffect, useState } from "react";
import type { ProductDTO } from "@/lib/types";

let productsCache: ProductDTO[] | null = null;

export function useProducts(refreshKey = 0) {
  const [products, setProducts] = useState<ProductDTO[]>(productsCache ?? []);
  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          productsCache = j.data;
          setProducts(j.data);
        }
      });
  }, [refreshKey]);
  return products;
}

export function useFacets() {
  const [facets, setFacets] = useState<{ industries: string[]; locations: string[] }>({ industries: [], locations: [] });
  useEffect(() => {
    fetch("/api/leads/facets", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.success && setFacets(j.data));
  }, []);
  return facets;
}

let configCache: { whatsappTemplate: string; staleLeadHours: number } | null = null;

export function useSalesConfig() {
  const [config, setConfig] = useState(configCache);
  useEffect(() => {
    if (configCache) return;
    fetch("/api/sales-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          configCache = j.data;
          setConfig(j.data);
        }
      });
  }, []);
  return config;
}
