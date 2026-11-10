export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          expiry_alert_days: number
          id: boolean
          qris_image_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          expiry_alert_days?: number
          id?: boolean
          qris_image_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          expiry_alert_days?: number
          id?: boolean
          qris_image_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          employee_id: string
          id: string
          shift_id: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          shift_id: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      bpjs_susulan_items: {
        Row: {
          created_at: string
          created_by: string
          delivery_date: string
          drug_name: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfillment_status: string
          id: string
          line_total: number | null
          product_id: string | null
          quantity: number
          request_key: string
          transaction_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_date: string
          drug_name: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_status?: string
          id?: string
          line_total?: number | null
          product_id?: string | null
          quantity: number
          request_key: string
          transaction_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_date?: string
          drug_name?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_status?: string
          id?: string
          line_total?: number | null
          product_id?: string | null
          quantity?: number
          request_key?: string
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bpjs_susulan_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpjs_susulan_items_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpjs_susulan_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpjs_susulan_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpjs_susulan_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      checkout_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string
          fingerprint: Json
          request_id: string
          result: Json | null
          transaction_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          fingerprint: Json
          request_id: string
          result?: Json | null
          transaction_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          fingerprint?: Json
          request_id?: string
          result?: Json | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transaction_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access_guard: {
        Row: {
          id: boolean
          revision: number
        }
        Insert: {
          id: boolean
          revision: number
        }
        Update: {
          id?: boolean
          revision?: number
        }
        Relationships: []
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          attempt_id: string | null
          attempts: number
          auth_user_id: string
          email: string
          employee_id: string
          failure_code: string | null
          invited_at: string | null
          lease_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempt_id?: string | null
          attempts?: number
          auth_user_id?: string
          email: string
          employee_id: string
          failure_code?: string | null
          invited_at?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempt_id?: string | null
          attempts?: number
          auth_user_id?: string
          email?: string
          employee_id?: string
          failure_code?: string | null
          invited_at?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permission_overrides: {
        Row: {
          effect: string
          employee_id: string
          permission_code: string
        }
        Insert: {
          effect: string
          employee_id: string
          permission_code: string
        }
        Update: {
          effect?: string
          employee_id?: string
          permission_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permission_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_permission_overrides_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          creation_request_id: string | null
          full_name: string
          id: string
          is_active: boolean
          join_date: string
          phone: string | null
          position: Database["public"]["Enums"]["employee_position"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          creation_request_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          join_date?: string
          phone?: string | null
          position?: Database["public"]["Enums"]["employee_position"]
          updated_at?: string
          username?: string
        }
        Update: {
          created_at?: string
          creation_request_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          join_date?: string
          phone?: string | null
          position?: Database["public"]["Enums"]["employee_position"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      initial_product_import_requests: {
        Row: {
          actor_id: string
          created_at: string
          payload: Json
          request_id: string
          result: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          payload: Json
          request_id: string
          result: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          payload?: Json
          request_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "initial_product_import_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          business_date: string
          last_number: number
        }
        Insert: {
          business_date: string
          last_number?: number
        }
        Update: {
          business_date?: string
          last_number?: number
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          failures: number
          identifier: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          failures?: number
          identifier: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          failures?: number
          identifier?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manual_stock_receiving_events: {
        Row: {
          actor_id: string
          batch_id: string
          id: string
          occurred_at: string
          product_id: string
          quantity_base: number
          reason: string | null
          reference: string | null
          request_id: string
          source: string
          supplier_id: string | null
        }
        Insert: {
          actor_id: string
          batch_id: string
          id?: string
          occurred_at: string
          product_id: string
          quantity_base: number
          reason?: string | null
          reference?: string | null
          request_id: string
          source: string
          supplier_id?: string | null
        }
        Update: {
          actor_id?: string
          batch_id?: string
          id?: string
          occurred_at?: string
          product_id?: string
          quantity_base?: number
          reason?: string | null
          reference?: string | null
          request_id?: string
          source?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_stock_receiving_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_events_batch_id_product_id_fkey"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["batch_id", "product_id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_events_batch_id_product_id_fkey"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "manual_stock_receiving_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_stock_receiving_requests: {
        Row: {
          actor_id: string
          created_at: string
          payload: Json
          product_id: string
          request_id: string
          result: Json
          source: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          payload: Json
          product_id: string
          request_id: string
          result: Json
          source: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          payload?: Json
          product_id?: string
          request_id?: string
          result?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_stock_receiving_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_stock_receiving_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date?: string
          id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_definitions: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
      }
      product_batches: {
        Row: {
          batch_number: string | null
          cost_price: number
          created_at: string
          expired_date: string | null
          id: string
          product_id: string
          purchase_invoice_item_id: string | null
          quantity: number
          received_date: string
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          cost_price: number
          created_at?: string
          expired_date?: string | null
          id?: string
          product_id: string
          purchase_invoice_item_id?: string | null
          quantity: number
          received_date?: string
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          cost_price?: number
          created_at?: string
          expired_date?: string | null
          id?: string
          product_id?: string
          purchase_invoice_item_id?: string | null
          quantity?: number
          received_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_purchase_invoice_item_id_fkey"
            columns: ["purchase_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoice_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units: {
        Row: {
          barcode: string | null
          conversion_to_base: number
          created_at: string
          id: string
          is_base_unit: boolean
          product_id: string
          selling_price: number
          unit_name: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          conversion_to_base: number
          created_at?: string
          id?: string
          is_base_unit?: boolean
          product_id: string
          selling_price: number
          unit_name: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          conversion_to_base?: number
          created_at?: string
          id?: string
          is_base_unit?: boolean
          product_id?: string
          selling_price?: number
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_unit: string | null
          category_id: string | null
          classification_pending: boolean
          cost_price: number | null
          created_at: string
          default_supplier_id: string | null
          description: string | null
          drug_classification: Database["public"]["Enums"]["drug_classification"]
          generic_name: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_taxable: boolean
          legacy_supplier_text: string | null
          manufacturer: string | null
          minimum_stock: number
          name: string
          requires_prescription: boolean | null
          sku: string
          storage_location_id: string | null
          subcategory_id: string | null
          tax_rate: number
          unit_confirmed: boolean
          updated_at: string
        }
        Insert: {
          base_unit?: string | null
          category_id?: string | null
          classification_pending?: boolean
          cost_price?: number | null
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          drug_classification?: Database["public"]["Enums"]["drug_classification"]
          generic_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_taxable?: boolean
          legacy_supplier_text?: string | null
          manufacturer?: string | null
          minimum_stock?: number
          name: string
          requires_prescription?: boolean | null
          sku: string
          storage_location_id?: string | null
          subcategory_id?: string | null
          tax_rate?: number
          unit_confirmed?: boolean
          updated_at?: string
        }
        Update: {
          base_unit?: string | null
          category_id?: string | null
          classification_pending?: boolean
          cost_price?: number | null
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          drug_classification?: Database["public"]["Enums"]["drug_classification"]
          generic_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_taxable?: boolean
          legacy_supplier_text?: string | null
          manufacturer?: string | null
          minimum_stock?: number
          name?: string
          requires_prescription?: boolean | null
          sku?: string
          storage_location_id?: string | null
          subcategory_id?: string | null
          tax_rate?: number
          unit_confirmed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_products_subcategory"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_items: {
        Row: {
          base_unit_snapshot: string
          batch_number: string
          conversion_to_base: number
          cost_price: number
          created_at: string
          created_by: string
          deleted_at: string | null
          expired_date: string | null
          id: string
          invoice_id: string
          margin_percent: number | null
          pricing_mode: string
          product_id: string
          product_name_snapshot: string
          product_unit_id: string | null
          quantity: number
          selling_price: number
          sku_snapshot: string
          subtotal: number | null
          tax_rate: number
          unit_name_snapshot: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          base_unit_snapshot: string
          batch_number: string
          conversion_to_base: number
          cost_price: number
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expired_date?: string | null
          id: string
          invoice_id: string
          margin_percent?: number | null
          pricing_mode: string
          product_id: string
          product_name_snapshot: string
          product_unit_id?: string | null
          quantity: number
          selling_price: number
          sku_snapshot: string
          subtotal?: number | null
          tax_rate: number
          unit_name_snapshot: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          base_unit_snapshot?: string
          batch_number?: string
          conversion_to_base?: number
          cost_price?: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expired_date?: string | null
          id?: string
          invoice_id?: string
          margin_percent?: number | null
          pricing_mode?: string
          product_id?: string
          product_name_snapshot?: string
          product_unit_id?: string | null
          quantity?: number
          selling_price?: number
          sku_snapshot?: string
          subtotal?: number | null
          tax_rate?: number
          unit_name_snapshot?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_unit_id_product_id_fkey"
            columns: ["product_unit_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_date: string
          payment_key: string
          recorded_by: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_date?: string
          payment_key: string
          recorded_by: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_date?: string
          payment_key?: string
          recorded_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "purchase_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_receipts: {
        Row: {
          batch_id: string
          cost_price_base: number
          created_base_unit: boolean
          invoice_id: string
          item_id: string
          new_cost_price: number
          new_selling_price: number
          new_tax_rate: number
          previous_cost_price: number | null
          previous_selling_price: number | null
          previous_tax_rate: number
          product_id: string
          product_unit_id: string
          quantity_base: number
          received_at: string
        }
        Insert: {
          batch_id: string
          cost_price_base: number
          created_base_unit: boolean
          invoice_id: string
          item_id: string
          new_cost_price: number
          new_selling_price: number
          new_tax_rate: number
          previous_cost_price?: number | null
          previous_selling_price?: number | null
          previous_tax_rate: number
          product_id: string
          product_unit_id: string
          quantity_base: number
          received_at?: string
        }
        Update: {
          batch_id?: string
          cost_price_base?: number
          created_base_unit?: boolean
          invoice_id?: string
          item_id?: string
          new_cost_price?: number
          new_selling_price?: number
          new_tax_rate?: number
          previous_cost_price?: number | null
          previous_selling_price?: number | null
          previous_tax_rate?: number
          product_id?: string
          product_unit_id?: string
          quantity_base?: number
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_receipts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "purchase_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_receipts_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_requests: {
        Row: {
          created_at: string
          employee_id: string
          invoice_id: string
          payload: Json
          request_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          invoice_id: string
          payload: Json
          request_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          invoice_id?: string
          payload?: Json
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_requests_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "purchase_invoice_requests_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          document_name: string | null
          document_path: string | null
          document_type: string | null
          due_date: string | null
          due_days: number | null
          finalization_snapshot: Json | null
          id: string
          invoice_date: string
          invoice_number: string
          payment_method: string | null
          status: string
          supplier_id: string
          total_amount: number
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          document_name?: string | null
          document_path?: string | null
          document_type?: string | null
          due_date?: string | null
          due_days?: number | null
          finalization_snapshot?: Json | null
          id: string
          invoice_date: string
          invoice_number: string
          payment_method?: string | null
          status?: string
          supplier_id: string
          total_amount: number
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          document_name?: string | null
          document_path?: string | null
          document_type?: string | null
          due_date?: string | null
          due_days?: number | null
          finalization_snapshot?: Json | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          payment_method?: string | null
          status?: string
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      return_item_batches: {
        Row: {
          batch_id: string
          cost_price_snapshot: number
          created_at: string
          id: string
          product_id: string
          quantity_in_base: number
          return_item_id: string
        }
        Insert: {
          batch_id: string
          cost_price_snapshot: number
          created_at?: string
          id?: string
          product_id: string
          quantity_in_base: number
          return_item_id: string
        }
        Update: {
          batch_id?: string
          cost_price_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string
          quantity_in_base?: number
          return_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_return_item_batches_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["batch_id", "product_id"]
          },
          {
            foreignKeyName: "fk_return_item_batches_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "fk_return_item_batches_item_product"
            columns: ["return_item_id", "product_id"]
            isOneToOne: false
            referencedRelation: "return_items"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: string
          created_at: string
          id: string
          is_restocked: boolean
          product_id: string
          quantity_in_base: number
          refund_subtotal: number
          refund_tax_amount: number
          refund_total: number
          restocked_at: string | null
          restocked_by: string | null
          return_id: string
          transaction_item_id: string | null
        }
        Insert: {
          condition?: string
          created_at?: string
          id?: string
          is_restocked?: boolean
          product_id: string
          quantity_in_base: number
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          restocked_at?: string | null
          restocked_by?: string | null
          return_id: string
          transaction_item_id?: string | null
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          is_restocked?: boolean
          product_id?: string
          quantity_in_base?: number
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          restocked_at?: string | null
          restocked_by?: string | null
          return_id?: string
          transaction_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_return_items_transaction_item_product"
            columns: ["transaction_item_id", "product_id"]
            isOneToOne: false
            referencedRelation: "transaction_items"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_restocked_by_fkey"
            columns: ["restocked_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_sequences: {
        Row: {
          business_date: string
          last_number: number
        }
        Insert: {
          business_date: string
          last_number: number
        }
        Update: {
          business_date?: string
          last_number?: number
        }
        Relationships: []
      }
      returns: {
        Row: {
          admin_notes: string | null
          business_date: string
          created_at: string
          id: string
          processed_by: string
          reason: string
          refund_confirmed_at: string | null
          refund_confirmed_by: string | null
          refund_method: Database["public"]["Enums"]["payment_method"] | null
          refund_status: string
          refund_subtotal: number
          refund_tax_amount: number
          refund_total: number
          requested_by: string | null
          return_number: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["return_source"]
          status: string
          transaction_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          business_date?: string
          created_at?: string
          id?: string
          processed_by: string
          reason: string
          refund_confirmed_at?: string | null
          refund_confirmed_by?: string | null
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_status?: string
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          requested_by?: string | null
          return_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: Database["public"]["Enums"]["return_source"]
          status?: string
          transaction_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          business_date?: string
          created_at?: string
          id?: string
          processed_by?: string
          reason?: string
          refund_confirmed_at?: string | null
          refund_confirmed_by?: string | null
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_status?: string
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          requested_by?: string | null
          return_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["return_source"]
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_refund_confirmed_by_fkey"
            columns: ["refund_confirmed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role: Database["public"]["Enums"]["employee_position"]
        }
        Insert: {
          permission_code: string
          role: Database["public"]["Enums"]["employee_position"]
        }
        Update: {
          permission_code?: string
          role?: Database["public"]["Enums"]["employee_position"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      security_audit_events: {
        Row: {
          action: string
          actor_employee_id: string | null
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: number
          reason: string | null
          target_id: string
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: never
          reason?: string | null
          target_id: string
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: never
          reason?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_events_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          planned_end: string
          planned_start: string
          shift_date: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          planned_end: string
          planned_start: string
          shift_date: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          planned_end?: string
          planned_start?: string
          shift_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          notes: string | null
          physical_quantity: number | null
          product_id: string
          session_id: string
          system_quantity: number
          updated_at: string
          variance: number | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          notes?: string | null
          physical_quantity?: number | null
          product_id: string
          session_id: string
          system_quantity: number
          updated_at?: string
          variance?: number | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          physical_quantity?: number | null
          product_id?: string
          session_id?: string
          system_quantity?: number
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_stock_opname_items_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["batch_id", "product_id"]
          },
          {
            foreignKeyName: "fk_stock_opname_items_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "stock_opname_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_opname_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_sessions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          id: string
          session_date: string
          status: string
          storage_location_id: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          session_date?: string
          status?: string
          storage_location_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          session_date?: string
          status?: string
          storage_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_sessions_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          created_at: string
          full_code: string
          id: string
          level_code: string
          rack_code: string
          updated_at: string
          zone_code: string
        }
        Insert: {
          created_at?: string
          full_code: string
          id?: string
          level_code: string
          rack_code: string
          updated_at?: string
          zone_code: string
        }
        Update: {
          created_at?: string
          full_code?: string
          id?: string
          level_code?: string
          rack_code?: string
          updated_at?: string
          zone_code?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          legacy_code: string | null
          license_number: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_code?: string | null
          license_number?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_code?: string | null
          license_number?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      transaction_item_batches: {
        Row: {
          batch_id: string
          cost_price_snapshot: number
          created_at: string
          id: string
          product_id: string
          quantity_in_base: number
          transaction_item_id: string
        }
        Insert: {
          batch_id: string
          cost_price_snapshot: number
          created_at?: string
          id?: string
          product_id: string
          quantity_in_base: number
          transaction_item_id: string
        }
        Update: {
          batch_id?: string
          cost_price_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string
          quantity_in_base?: number
          transaction_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transaction_item_batches_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "batch_supplier"
            referencedColumns: ["batch_id", "product_id"]
          },
          {
            foreignKeyName: "fk_transaction_item_batches_batch_product"
            columns: ["batch_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "fk_transaction_item_batches_item_product"
            columns: ["transaction_item_id", "product_id"]
            isOneToOne: false
            referencedRelation: "transaction_items"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          conversion_to_base_snapshot: number
          created_at: string
          discount_amount: number
          id: string
          product_id: string
          product_name_snapshot: string
          product_unit_id: string
          quantity_in_base: number
          quantity_in_unit: number
          subtotal: number
          tax_amount: number
          tax_rate_snapshot: number
          total_amount: number
          transaction_id: string
          unit_name_snapshot: string
          unit_price: number
        }
        Insert: {
          conversion_to_base_snapshot: number
          created_at?: string
          discount_amount?: number
          id?: string
          product_id: string
          product_name_snapshot: string
          product_unit_id: string
          quantity_in_base: number
          quantity_in_unit: number
          subtotal: number
          tax_amount?: number
          tax_rate_snapshot?: number
          total_amount: number
          transaction_id: string
          unit_name_snapshot: string
          unit_price: number
        }
        Update: {
          conversion_to_base_snapshot?: number
          created_at?: string
          discount_amount?: number
          id?: string
          product_id?: string
          product_name_snapshot?: string
          product_unit_id?: string
          quantity_in_base?: number
          quantity_in_unit?: number
          subtotal?: number
          tax_amount?: number
          tax_rate_snapshot?: number
          total_amount?: number
          transaction_id?: string
          unit_name_snapshot?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_transaction_items_unit_product"
            columns: ["product_unit_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_prescriptions: {
        Row: {
          bpjs_number: string | null
          created_at: string
          doctor_name: string | null
          id: string
          patient_name: string | null
          photo_url: string | null
          prescription_category: string | null
          prescription_date: string | null
          prescription_number: string | null
          prescription_origin: string | null
          transaction_id: string
        }
        Insert: {
          bpjs_number?: string | null
          created_at?: string
          doctor_name?: string | null
          id?: string
          patient_name?: string | null
          photo_url?: string | null
          prescription_category?: string | null
          prescription_date?: string | null
          prescription_number?: string | null
          prescription_origin?: string | null
          transaction_id: string
        }
        Update: {
          bpjs_number?: string | null
          created_at?: string
          doctor_name?: string | null
          id?: string
          patient_name?: string | null
          photo_url?: string | null
          prescription_category?: string | null
          prescription_date?: string | null
          prescription_number?: string | null
          prescription_origin?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_prescriptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_history_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_prescriptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          business_date: string
          cash_change: number | null
          cash_received: number | null
          cashier_id: string
          created_at: string
          id: string
          invoice_number: string
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["transaction_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          business_date?: string
          cash_change?: number | null
          cash_received?: number | null
          cashier_id: string
          created_at?: string
          id?: string
          invoice_number: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          business_date?: string
          cash_change?: number | null
          cash_received?: number | null
          cashier_id?: string
          created_at?: string
          id?: string
          invoice_number?: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_confirmed_by_fkey"
            columns: ["payment_confirmed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          employee_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          employee_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          employee_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      batch_supplier: {
        Row: {
          batch_id: string | null
          invoice_id: string | null
          invoice_number: string | null
          product_id: string | null
          received_at: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_totals: {
        Row: {
          business_date: string | null
          cashier_id: string | null
          cashier_name: string | null
          completed_total: number | null
          gross_total: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          sale_count: number | null
          voided_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_history_view: {
        Row: {
          business_date: string | null
          cashier_id: string | null
          cashier_name: string | null
          created_at: string | null
          financial_status:
            | Database["public"]["Enums"]["transaction_status"]
            | null
          id: string | null
          invoice_number: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_stock_opname: {
        Args: { p_employee_id: string; p_session_id: string }
        Returns: Json
      }
      approve_customer_return: {
        Args: {
          p_admin_notes?: string
          p_confirm_refund?: boolean
          p_employee_id: string
          p_item_conditions?: Json
          p_return_id: string
        }
        Returns: Json
      }
      cancel_stock_opname: {
        Args: { p_employee_id: string; p_session_id: string }
        Returns: Json
      }
      checkout_transaction: {
        Args: {
          p_cash_received?: number
          p_employee_id: string
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_prescription?: Json
        }
        Returns: Json
      }
      checkout_transaction_idempotent: {
        Args: {
          p_cash_received?: number
          p_employee_id: string
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_prescription?: Json
          p_request_id: string
          p_supplementary_items?: Json
        }
        Returns: Json
      }
      checkout_transaction_with_prescription: {
        Args: {
          p_cash_received?: number
          p_employee_id: string
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_prescription?: Json
        }
        Returns: Json
      }
      complete_customer_return: {
        Args: {
          p_employee_id: string
          p_item_conditions?: Json
          p_return_id: string
        }
        Returns: Json
      }
      confirm_initial_product_unit: {
        Args: {
          p_employee_id: string
          p_expected_stock: number
          p_product_id: string
          p_selling_price: number
          p_unit_name: string
        }
        Returns: Json
      }
      confirm_qris_payment: {
        Args: { p_employee_id: string; p_transaction_id: string }
        Returns: Json
      }
      create_customer_return: {
        Args: {
          p_employee_id: string
          p_items: Json
          p_reason: string
          p_refund_method: Database["public"]["Enums"]["payment_method"]
          p_transaction_id: string
        }
        Returns: Json
      }
      create_product_with_base_unit: {
        Args: {
          p_barcode?: string
          p_base_unit: string
          p_category_id: string
          p_cost_price?: number
          p_default_supplier_id?: string
          p_description?: string
          p_drug_classification?: Database["public"]["Enums"]["drug_classification"]
          p_generic_name?: string
          p_image_url?: string
          p_is_active?: boolean
          p_is_taxable?: boolean
          p_manufacturer?: string
          p_minimum_stock?: number
          p_name: string
          p_selling_price: number
          p_sku: string
          p_storage_location_id?: string
          p_subcategory_id: string
          p_tax_rate?: number
          p_unit_name: string
        }
        Returns: Json
      }
      create_product_with_base_unit_and_initial_stock: {
        Args: {
          p_barcode?: string
          p_base_unit: string
          p_category_id: string
          p_cost_price?: number
          p_default_supplier_id?: string
          p_description?: string
          p_drug_classification?: Database["public"]["Enums"]["drug_classification"]
          p_generic_name?: string
          p_image_url?: string
          p_initial_batch?: Json
          p_is_active?: boolean
          p_is_taxable?: boolean
          p_manufacturer?: string
          p_minimum_stock?: number
          p_name: string
          p_selling_price: number
          p_sku: string
          p_storage_location_id?: string
          p_subcategory_id: string
          p_tax_rate?: number
          p_unit_name: string
        }
        Returns: Json
      }
      create_supplier_return: {
        Args: { p_employee_id: string; p_items: Json; p_reason: string }
        Returns: Json
      }
      dashboard_analytics_report: {
        Args: { p_from: string; p_to: string; p_year: number }
        Returns: Json
      }
      dashboard_low_stock: { Args: { p_business_date: string }; Returns: Json }
      delete_purchase_invoice: {
        Args: { p_employee_id: string; p_invoice_id: string }
        Returns: Json
      }
      employee_account_access: {
        Args: { p_auth_user: string }
        Returns: boolean
      }
      employee_admin_read: {
        Args: {
          p_actor: string
          p_employee?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      employee_admin_write: {
        Args: {
          p_actor: string
          p_employee: string
          p_operation: string
          p_reason: string
          p_values: Json
        }
        Returns: string
      }
      employee_invitation_accept: {
        Args: { p_auth_user: string; p_complete?: boolean }
        Returns: undefined
      }
      employee_invitation_command: {
        Args: {
          p_actor: string
          p_attempt?: string
          p_email?: string
          p_employee: string
          p_failure?: string
          p_operation: string
        }
        Returns: Json
      }
      employee_permission_read: {
        Args: { p_actor: string; p_employee: string }
        Returns: Json
      }
      finalize_purchase_receiving: {
        Args: {
          p_acknowledge_difference: boolean
          p_employee_id: string
          p_expected_version: number
          p_invoice_id: string
          p_request_id: string
          p_token: string
        }
        Returns: Json
      }
      find_login_email_by_username: {
        Args: { p_username: string }
        Returns: string
      }
      fulfill_bpjs_susulan_item: {
        Args: {
          p_employee_id: string
          p_product_id?: string
          p_susulan_id: string
        }
        Returns: undefined
      }
      get_employee_permissions: {
        Args: {
          p_employee_id: string
          p_role: Database["public"]["Enums"]["employee_position"]
        }
        Returns: Json
      }
      import_initial_products: {
        Args: { p_employee_id: string; p_request_id: string; p_rows: Json }
        Returns: Json
      }
      insert_bpjs_susulan_items: {
        Args: {
          p_delivery_date: string
          p_employee_id: string
          p_items: Json
          p_transaction_id: string
        }
        Returns: undefined
      }
      login_attempt_get: { Args: { p_identifier: string }; Returns: Json }
      login_attempt_set: {
        Args: {
          p_failures: number
          p_identifier: string
          p_locked_until: string
        }
        Returns: undefined
      }
      other_usable_owner: { Args: { p_excluded: string }; Returns: boolean }
      payment_refund_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      preview_purchase_receiving: {
        Args: { p_employee_id: string; p_invoice_id: string }
        Returns: Json
      }
      product_performance_report: {
        Args: { p_from: string; p_sort?: string; p_to: string }
        Returns: Json
      }
      product_stock_movement_read_model:
        | {
            Args: { p_limit?: number; p_page?: number; p_product_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_end_date: string
              p_limit: number
              p_movement_type: string
              p_page: number
              p_product_id: string
              p_start_date: string
            }
            Returns: Json
          }
      profit_loss_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      purchase_invoice_due_reminders: {
        Args: { p_today: string }
        Returns: Json
      }
      purchase_receiving_plan: { Args: { p_invoice_id: string }; Returns: Json }
      receive_initial_product_stock: {
        Args: {
          p_cost_price: number
          p_employee_id: string
          p_product_id: string
          p_quantity: number
          p_reference?: string
          p_request_id: string
        }
        Returns: Json
      }
      receive_product_stock: {
        Args: { p_batches: Json; p_employee_id: string; p_product_id: string }
        Returns: Json
      }
      receive_product_stock_manual: {
        Args: {
          p_batches: Json
          p_employee_id: string
          p_product_id: string
          p_reason?: string
          p_reference?: string
          p_request_id: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      record_purchase_invoice_payment: {
        Args: {
          p_amount: number
          p_employee_id: string
          p_invoice_id: string
          p_payment_date: string
          p_request_id: string
        }
        Returns: Json
      }
      reject_customer_return: {
        Args: {
          p_admin_notes: string
          p_employee_id: string
          p_return_id: string
        }
        Returns: Json
      }
      request_customer_return: {
        Args: {
          p_employee_id: string
          p_items: Json
          p_reason: string
          p_refund_method: Database["public"]["Enums"]["payment_method"]
          p_transaction_id: string
        }
        Returns: Json
      }
      require_employee_admin: { Args: { p_actor: string }; Returns: string }
      resolve_employee_session: { Args: { p_auth_user: string }; Returns: Json }
      sales_gross_profit_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      save_purchase_invoice_draft: {
        Args: {
          p_employee_id: string
          p_expected_version: number
          p_id: string
          p_payload: Json
          p_request_id: string
        }
        Returns: Json
      }
      save_purchase_invoice_draft_v2: {
        Args: {
          p_employee_id: string
          p_expected_version: number
          p_id: string
          p_payload: Json
          p_request_id: string
        }
        Returns: Json
      }
      set_employee_permission_override: {
        Args: {
          p_actor_auth_user_id: string
          p_effect: string
          p_employee_id: string
          p_permission_code: string
          p_reason: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_stock_opname: {
        Args: { p_employee_id: string; p_storage_location_id?: string }
        Returns: Json
      }
      stock_list_read_model: {
        Args: {
          p_active_status?: string
          p_business_date: string
          p_limit?: number
          p_page?: number
          p_prescription_status?: string
          p_query?: string
          p_sort?: string
          p_stock_status?: string
        }
        Returns: Json
      }
      void_transaction: {
        Args: {
          p_employee_id: string
          p_reason: string
          p_transaction_id: string
        }
        Returns: Json
      }
      write_purchase_invoice_item: {
        Args: {
          p_action: string
          p_employee_id: string
          p_expected_version: number
          p_invoice_id: string
          p_item_id: string
          p_payload: Json
          p_request_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      drug_classification: "otc" | "otc_limited" | "prescription_required"
      employee_position: "owner_admin" | "kasir" | "staf"
      payment_method: "cash" | "qris" | "bank_transfer" | "bpjs"
      return_source: "customer" | "supplier"
      transaction_status: "pending_payment" | "completed" | "voided"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      drug_classification: ["otc", "otc_limited", "prescription_required"],
      employee_position: ["owner_admin", "kasir", "staf"],
      payment_method: ["cash", "qris", "bank_transfer", "bpjs"],
      return_source: ["customer", "supplier"],
      transaction_status: ["pending_payment", "completed", "voided"],
    },
  },
} as const

