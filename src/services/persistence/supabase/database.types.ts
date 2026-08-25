/**
 * Tipos del esquema Supabase, escritos a mano para que coincidan
 * exactamente con `supabase/migrations/0001_schema.sql`.
 *
 * REGENERAR cuando exista el proyecto real (reemplaza este archivo entero):
 *
 *   npx supabase gen types typescript --project-id <project-ref> \
 *     --schema public > src/services/persistence/supabase/database.types.ts
 *
 * Mientras no exista el proyecto, este archivo es la fuente de verdad y se
 * mantiene a mano en sincronía con las migraciones.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "admin" | "customer";
          name: string | null;
          email: string | null;
          phone: string | null;
          is_anonymous: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: "admin" | "customer";
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          is_anonymous?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          code: string;
          name: string;
          price: number | null;
          raw_price: string | null;
          category: string;
          brand: string;
          image: string | null;
          images: string[];
          stock: number;
          low_stock_threshold: number;
          active: boolean;
          featured: boolean;
          description: string | null;
          variants: string[];
          source: string;
          source_row: number | null;
          incomplete: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          slug: string;
          code: string;
          name: string;
          price?: number | null;
          raw_price?: string | null;
          category: string;
          brand: string;
          image?: string | null;
          images?: string[];
          stock?: number;
          low_stock_threshold?: number;
          active?: boolean;
          featured?: boolean;
          description?: string | null;
          variants?: string[];
          source?: string;
          source_row?: number | null;
          incomplete?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          customer_id: string;
          customer_name: string;
          email: string;
          lines: Json;
          total: number;
          shipping: number;
          delivery_method: "envio" | "retiro";
          address: string | null;
          status: "pendiente" | "pago_simulado" | "preparando" | "enviado" | "entregado" | "cancelado";
          created_at: string;
          payment_reference: string | null;
          andreani_contract: string | null;
          andreani_shipment_number: string | null;
          andreani_status: string | null;
          andreani_tracking_url: string | null;
          andreani_label_url: string | null;
          andreani_claim_state: "claimed" | "created_unsaved" | null;
          andreani_claimed_at: string | null;
        };
        Insert: {
          id: string;
          customer_id: string;
          customer_name: string;
          email: string;
          lines?: Json;
          total: number;
          shipping?: number;
          delivery_method: "envio" | "retiro";
          address?: string | null;
          status?: "pendiente" | "pago_simulado" | "preparando" | "enviado" | "entregado" | "cancelado";
          created_at?: string;
          payment_reference?: string | null;
          andreani_contract?: string | null;
          andreani_shipment_number?: string | null;
          andreani_status?: string | null;
          andreani_tracking_url?: string | null;
          andreani_label_url?: string | null;
          andreani_claim_state?: "claimed" | "created_unsaved" | null;
          andreani_claimed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      carts: {
        Row: {
          owner_id: string;
          lines: Json;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          lines?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["carts"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          at: string;
          admin_id: string | null;
          admin_email: string;
          action: string;
          detail: string;
        };
        Insert: {
          id?: string;
          at?: string;
          admin_id?: string | null;
          admin_email: string;
          action: string;
          detail: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
