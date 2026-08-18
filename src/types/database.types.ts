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
      cash_drawer_sessions: {
        Row: {
          closed_at: string | null
          closing_balance_actual: number | null
          closing_balance_expected: number | null
          employee_id: string
          id: string
          is_open: boolean | null
          notes: string | null
          opened_at: string
          opening_balance: number
          shift_id: string | null
          variance: number | null
        }
        Insert: {
          closed_at?: string | null
          closing_balance_actual?: number | null
          closing_balance_expected?: number | null
          employee_id: string
          id?: string
          is_open?: boolean | null
          notes?: string | null
          opened_at?: string
          opening_balance: number
          shift_id?: string | null
          variance?: number | null
        }
        Update: {
          closed_at?: string | null
          closing_balance_actual?: number | null
          closing_balance_expected?: number | null
          employee_id?: string
          id?: string
          is_open?: boolean | null
          notes?: string | null
          opened_at?: string
          opening_balance?: number
          shift_id?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
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
      employees: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          join_date: string
          phone: string | null
          position: Database["public"]["Enums"]["employee_position"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          join_date?: string
          phone?: string | null
          position?: Database["public"]["Enums"]["employee_position"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          join_date?: string
          phone?: string | null
          position?: Database["public"]["Enums"]["employee_position"]
          updated_at?: string
        }
        Relationships: []
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
      product_batches: {
        Row: {
          batch_number: string
          cost_price: number
          created_at: string
          expired_date: string
          id: string
          product_id: string
          quantity: number
          received_date: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          cost_price: number
          created_at?: string
          expired_date: string
          id?: string
          product_id: string
          quantity: number
          received_date?: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          cost_price?: number
          created_at?: string
          expired_date?: string
          id?: string
          product_id?: string
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
          base_unit: string
          category_id: string
          cost_price: number
          created_at: string
          default_supplier_id: string | null
          description: string | null
          drug_classification: Database["public"]["Enums"]["drug_classification"]
          generic_name: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_taxable: boolean
          manufacturer: string | null
          minimum_stock: number
          name: string
          requires_prescription: boolean | null
          sku: string
          storage_location_id: string | null
          subcategory_id: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          base_unit: string
          category_id: string
          cost_price?: number
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          drug_classification?: Database["public"]["Enums"]["drug_classification"]
          generic_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_taxable?: boolean
          manufacturer?: string | null
          minimum_stock?: number
          name: string
          requires_prescription?: boolean | null
          sku: string
          storage_location_id?: string | null
          subcategory_id: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          base_unit?: string
          category_id?: string
          cost_price?: number
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          drug_classification?: Database["public"]["Enums"]["drug_classification"]
          generic_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_taxable?: boolean
          manufacturer?: string | null
          minimum_stock?: number
          name?: string
          requires_prescription?: boolean | null
          sku?: string
          storage_location_id?: string | null
          subcategory_id?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_subcategory_category"
            columns: ["subcategory_id", "category_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id", "category_id"]
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
          created_at: string
          id: string
          product_id: string
          quantity_in_base: number
          refund_subtotal: number
          refund_tax_amount: number
          refund_total: number
          return_id: string
          transaction_item_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity_in_base: number
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          return_id: string
          transaction_item_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity_in_base?: number
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
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
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          business_date: string
          cash_drawer_session_id: string | null
          created_at: string
          id: string
          processed_by: string
          reason: string
          refund_method: Database["public"]["Enums"]["payment_method"] | null
          refund_subtotal: number
          refund_tax_amount: number
          refund_total: number
          source: Database["public"]["Enums"]["return_source"]
          transaction_id: string | null
        }
        Insert: {
          business_date?: string
          cash_drawer_session_id?: string | null
          created_at?: string
          id?: string
          processed_by: string
          reason: string
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          source: Database["public"]["Enums"]["return_source"]
          transaction_id?: string | null
        }
        Update: {
          business_date?: string
          cash_drawer_session_id?: string | null
          created_at?: string
          id?: string
          processed_by?: string
          reason?: string
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_subtotal?: number
          refund_tax_amount?: number
          refund_total?: number
          source?: Database["public"]["Enums"]["return_source"]
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_cash_drawer_session_id_fkey"
            columns: ["cash_drawer_session_id"]
            isOneToOne: false
            referencedRelation: "cash_drawer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "employees"
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
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
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
          license_number?: string | null
          name?: string
          phone?: string | null
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
          id: string
          product_id: string
          product_unit_id: string
          quantity_in_base: number
          quantity_in_unit: number
          subtotal: number
          tax_amount: number
          tax_rate_snapshot: number
          total_amount: number
          transaction_id: string
          unit_price: number
        }
        Insert: {
          conversion_to_base_snapshot: number
          created_at?: string
          id?: string
          product_id: string
          product_unit_id: string
          quantity_in_base: number
          quantity_in_unit: number
          subtotal: number
          tax_amount?: number
          tax_rate_snapshot?: number
          total_amount: number
          transaction_id: string
          unit_price: number
        }
        Update: {
          conversion_to_base_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string
          product_unit_id?: string
          quantity_in_base?: number
          quantity_in_unit?: number
          subtotal?: number
          tax_amount?: number
          tax_rate_snapshot?: number
          total_amount?: number
          transaction_id?: string
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
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_prescriptions: {
        Row: {
          created_at: string
          doctor_name: string
          id: string
          patient_name: string
          photo_url: string | null
          prescription_number: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          doctor_name: string
          id?: string
          patient_name: string
          photo_url?: string | null
          prescription_number?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          doctor_name?: string
          id?: string
          patient_name?: string
          photo_url?: string | null
          prescription_number?: string | null
          transaction_id?: string
        }
        Relationships: [
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
          cash_drawer_session_id: string
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
          cash_drawer_session_id: string
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
          cash_drawer_session_id?: string
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
            foreignKeyName: "transactions_cash_drawer_session_id_fkey"
            columns: ["cash_drawer_session_id"]
            isOneToOne: false
            referencedRelation: "cash_drawer_sessions"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    Functions: {
      apply_stock_opname: {
        Args: { p_employee_id: string; p_session_id: string }
        Returns: Json
      }
      cancel_stock_opname: {
        Args: { p_employee_id: string; p_session_id: string }
        Returns: Json
      }
      checkout_transaction: {
        Args: {
          p_cash_drawer_session_id: string
          p_cash_received?: number
          p_employee_id: string
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_prescription?: Json
        }
        Returns: Json
      }
      close_cash_drawer: {
        Args: {
          p_actual_closing_cash: number
          p_employee_id: string
          p_session_id: string
        }
        Returns: Json
      }
      confirm_qris_payment: {
        Args: { p_employee_id: string; p_transaction_id: string }
        Returns: Json
      }
      create_customer_return: {
        Args: {
          p_cash_drawer_session_id: string
          p_employee_id: string
          p_items: Json
          p_reason: string
          p_refund_method: Database["public"]["Enums"]["payment_method"]
          p_transaction_id: string
        }
        Returns: Json
      }
      create_supplier_return: {
        Args: { p_employee_id: string; p_items: Json; p_reason: string }
        Returns: Json
      }
      open_cash_drawer: {
        Args: { p_employee_id: string; p_opening_balance: number }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_stock_opname: {
        Args: { p_employee_id: string; p_storage_location_id?: string }
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
    }
    Enums: {
      drug_classification: "otc" | "otc_limited" | "prescription_required"
      employee_position: "owner_admin" | "kasir" | "staf"
      payment_method: "cash" | "qris"
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
      payment_method: ["cash", "qris"],
      return_source: ["customer", "supplier"],
      transaction_status: ["pending_payment", "completed", "voided"],
    },
  },
} as const

