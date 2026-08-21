/**
 * PLACEHOLDER TYPES — hand-written, covering every table/view/function the
 * app code actually queries as of this phase. This sandbox has no network
 * access, so the real generator command could not be run:
 *
 *   supabase gen types typescript --project-id <id> > types/database.types.ts
 *
 * Claude Code MUST run that against the real project and replace this file.
 * Hand-maintained types drift from the schema fast — this file exists only
 * so the app compiles meaningfully in the meantime.
 */

type Row<T> = T;
type PartialInsert<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: Row<{
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['stores']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['stores']['Row']>;
      };
      profiles: {
        Row: Row<{
          id: string;
          full_name: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['profiles']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['profiles']['Row']>;
      };
      user_roles: {
        Row: Row<{
          id: string;
          store_id: string;
          user_id: string;
          role: 'owner' | 'cashier' | 'inventory_manager';
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['user_roles']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['user_roles']['Row']>;
      };
      store_settings: {
        Row: Row<{
          store_id: string;
          invoice_footer: string;
          currency: string;
          currency_symbol: string;
          tax_enabled: boolean;
          tax_percent: number;
          default_discount_pct: number;
          low_stock_default: number;
          expiry_alert_days: number;
          receipt_width_mm: number;
          invoice_seq_year: number;
          invoice_seq_number: number;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['store_settings']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['store_settings']['Row']>;
      };
      categories: {
        Row: Row<{
          id: string;
          store_id: string;
          name: string;
          description: string | null;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['categories']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['categories']['Row']>;
      };
      products: {
        Row: Row<{
          id: string;
          store_id: string;
          name: string;
          generic_name: string | null;
          brand: string | null;
          category_id: string | null;
          medicine_type: string | null;
          barcode: string | null;
          min_stock_level: number;
          rack_location: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['products']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['products']['Row']>;
      };
      suppliers: {
        Row: Row<{
          id: string;
          store_id: string;
          name: string;
          company: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['suppliers']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['suppliers']['Row']>;
      };
      customers: {
        Row: Row<{
          id: string;
          store_id: string;
          name: string;
          phone: string | null;
          address: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['customers']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['customers']['Row']>;
      };
      expenses: {
        Row: Row<{
          id: string;
          store_id: string;
          category: string;
          title: string;
          amount: number;
          expense_date: string;
          description: string | null;
          payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          created_by: string;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['expenses']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['expenses']['Row']>;
      };
      stock_movements: {
        Row: Row<{
          id: string;
          store_id: string;
          product_id: string;
          batch_id: string;
          movement_type: string;
          quantity_change: number;
          quantity_after: number;
          reference_table: string | null;
          reference_id: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['stock_movements']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['stock_movements']['Row']>;
      };
      sales: {
        Row: Row<{
          id: string;
          store_id: string;
          invoice_number: string;
          customer_id: string | null;
          cashier_id: string;
          subtotal: number;
          discount_total: number;
          tax_total: number;
          total: number;
          amount_paid: number;
          change_due: number;
          payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          gross_profit: number;
          status: 'completed' | 'returned' | 'partially_returned';
          client_transaction_id: string | null;
          synced_from_offline: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['sales']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['sales']['Row']>;
      };
      payments: {
        Row: Row<{
          id: string;
          store_id: string;
          sale_id: string;
          customer_id: string | null;
          amount: number;
          payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          payment_date: string;
          notes: string | null;
          created_by: string;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['payments']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['payments']['Row']>;
      };
      returns: {
        Row: Row<{
          id: string;
          store_id: string;
          sale_id: string;
          reason: string | null;
          refund_amount: number;
          status: 'pending' | 'approved' | 'rejected';
          approved_by: string | null;
          approved_at: string | null;
          processed_by: string;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['returns']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['returns']['Row']>;
      };
      return_items: {
        Row: Row<{
          id: string;
          return_id: string;
          sale_item_id: string;
          product_id: string;
          batch_id: string;
          quantity: number;
          unit_price: number;
          line_refund: number;
          restocked: boolean;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['return_items']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['return_items']['Row']>;
      };
      audit_logs: {
        Row: Row<{
          id: string;
          store_id: string | null;
          user_id: string | null;
          table_name: string;
          record_id: string | null;
          action: 'insert' | 'update' | 'delete';
          old_data: Record<string, unknown> | null;
          new_data: Record<string, unknown> | null;
          created_at: string;
        }>;
        Insert: PartialInsert<Database['public']['Tables']['audit_logs']['Row']>;
        Update: PartialInsert<Database['public']['Tables']['audit_logs']['Row']>;
      };
    };
    Views: {
      product_batches_pos_view: {
        Row: Row<{
          id: string;
          store_id: string;
          product_id: string;
          supplier_id: string | null;
          batch_number: string | null;
          quantity: number;
          purchase_price: number | null;
          selling_price: number;
          expiry_date: string;
          received_date: string;
          created_at: string;
          updated_at: string;
        }>;
      };
      sale_items_detail_view: {
        Row: Row<{
          id: string;
          sale_id: string;
          product_id: string;
          batch_id: string;
          quantity: number;
          unit_price: number;
          unit_cost: number | null;
          discount: number;
          line_total: number;
          line_profit: number | null;
          created_at: string;
        }>;
      };
      product_stock_summary: {
        Row: Row<{
          product_id: string;
          store_id: string;
          name: string;
          min_stock_level: number;
          current_stock: number;
          expired_stock: number;
          inventory_value: number;
          next_expiry_date: string | null;
        }>;
      };
      daily_sales_summary: {
        Row: Row<{
          store_id: string;
          sale_date: string;
          transaction_count: number;
          revenue: number;
          gross_profit: number;
          items_sold: number;
        }>;
      };
      customer_outstanding: {
        Row: Row<{
          customer_id: string;
          store_id: string;
          name: string;
          total_invoiced: number;
          total_paid: number;
          outstanding_balance: number;
        }>;
      };
      supplier_outstanding: {
        Row: Row<{
          supplier_id: string;
          store_id: string;
          name: string;
          total_purchased: number;
          total_paid: number;
          outstanding_balance: number;
        }>;
      };
    };
    Functions: {
      create_store_and_owner: {
        Args: { p_store_name: string };
        Returns: string;
      };
      add_product_batch: {
        Args: {
          p_product_id: string;
          p_batch_number: string | null;
          p_quantity: number;
          p_purchase_price: number;
          p_selling_price: number;
          p_expiry_date: string;
          p_supplier_id: string | null;
          p_received_date: string;
        };
        Returns: string;
      };
      process_sale: {
        Args: {
          p_items: { product_id: string; quantity: number; unit_discount: number }[];
          p_customer_id: string | null;
          p_total_discount: number;
          p_amount_paid: number;
          p_payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          p_client_transaction_id?: string | null;
        };
        Returns: string;
      };
      process_return: {
        Args: {
          p_sale_id: string;
          p_items: { sale_item_id: string; quantity: number }[];
          p_reason: string | null;
          p_restock: boolean;
        };
        Returns: string;
      };
      approve_return: {
        Args: { p_return_id: string; p_approve: boolean };
        Returns: void;
      };
      record_customer_payment: {
        Args: {
          p_sale_id: string;
          p_amount: number;
          p_payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          p_notes: string | null;
        };
        Returns: string;
      };
      record_supplier_payment: {
        Args: {
          p_purchase_id: string;
          p_amount: number;
          p_payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
          p_notes: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      user_role: 'owner' | 'cashier' | 'inventory_manager';
      payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
      stock_movement_type:
        | 'purchase'
        | 'sale'
        | 'return'
        | 'adjustment'
        | 'damaged'
        | 'expired'
        | 'initial';
    };
  };
}
