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
          shipping_weight_kg: number | null;
          shipping_height_cm: number | null;
          shipping_width_cm: number | null;
          shipping_length_cm: number | null;
          shipping_enabled: boolean;
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
          shipping_weight_kg?: number | null;
          shipping_height_cm?: number | null;
          shipping_width_cm?: number | null;
          shipping_length_cm?: number | null;
          shipping_enabled?: boolean;
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
          payment_status: "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";
          phone: string | null;
          postal_code: string | null;
          province: string | null;
          locality: string | null;
          street: string | null;
          street_number: string | null;
          floor: string | null;
          apartment: string | null;
          address_reference: string | null;
          shipping_quote_id: string | null;
          shipping_provider: string | null;
          shipping_carrier: string | null;
          shipping_service: string | null;
          shipping_delivery_type: "domicilio" | "sucursal" | null;
          shipping_branch_id: string | null;
          shipping_branch_name: string | null;
          shipping_branch_address: string | null;
          shipping_status: "manual_quote" | "quoted" | "creating" | "processing" | "ready" | "in_transit" | "delivered" | "cancelled" | "error" | null;
          shipping_tracking_number: string | null;
          shipping_label_ready: boolean;
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
          payment_status?: "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";
          phone?: string | null;
          postal_code?: string | null;
          province?: string | null;
          locality?: string | null;
          street?: string | null;
          street_number?: string | null;
          floor?: string | null;
          apartment?: string | null;
          address_reference?: string | null;
          shipping_quote_id?: string | null;
          shipping_provider?: string | null;
          shipping_carrier?: string | null;
          shipping_service?: string | null;
          shipping_delivery_type?: "domicilio" | "sucursal" | null;
          shipping_branch_id?: string | null;
          shipping_branch_name?: string | null;
          shipping_branch_address?: string | null;
          shipping_status?: "manual_quote" | "quoted" | "creating" | "processing" | "ready" | "in_transit" | "delivered" | "cancelled" | "error" | null;
          shipping_tracking_number?: string | null;
          shipping_label_ready?: boolean;
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
