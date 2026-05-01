export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          currency_code: string | null
          id: string
          initial_balance: number | null
          name: string
          organization_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          currency_code?: string | null
          id?: string
          initial_balance?: number | null
          name: string
          organization_id: string
          type?: string
        }
        Update: {
          created_at?: string | null
          currency_code?: string | null
          id?: string
          initial_balance?: number | null
          name?: string
          organization_id?: string
          type?: string
        }
        Relationships: []
      }
      action_items: {
        Row: {
          description: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          impact_amount: number | null
          organization_id: string
          priority: number | null
          ref_id: string | null
          ref_type: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          impact_amount?: number | null
          organization_id: string
          priority?: number | null
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          impact_amount?: number | null
          organization_id?: string
          priority?: number | null
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string | null
          id: string
          kind: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kind?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kind?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          cost_usd: number | null
          created_at: string | null
          id: string
          role: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_monthly: {
        Row: {
          calls: number | null
          cost_usd: number | null
          id: string
          month: string
          organization_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          calls?: number | null
          cost_usd?: number | null
          id?: string
          month: string
          organization_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          calls?: number | null
          cost_usd?: number | null
          id?: string
          month?: string
          organization_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string | null
          event_date: string | null
          id: string
          is_read: boolean | null
          message: string | null
          organization_id: string
          severity: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          event_date?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          organization_id: string
          severity?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          event_date?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          organization_id?: string
          severity?: string | null
          title?: string
        }
        Relationships: []
      }
      ap_bills: {
        Row: {
          amount: number
          bill_no: string | null
          created_at: string | null
          critical_flag: boolean | null
          currency_code: string | null
          due_date: string
          id: string
          import_id: string | null
          is_demo: boolean | null
          issue_date: string | null
          organization_id: string
          status: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          bill_no?: string | null
          created_at?: string | null
          critical_flag?: boolean | null
          currency_code?: string | null
          due_date: string
          id?: string
          import_id?: string | null
          is_demo?: boolean | null
          issue_date?: string | null
          organization_id: string
          status?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          bill_no?: string | null
          created_at?: string | null
          critical_flag?: boolean | null
          currency_code?: string | null
          due_date?: string
          id?: string
          import_id?: string | null
          is_demo?: boolean | null
          issue_date?: string | null
          organization_id?: string
          status?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_bills_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_invoices: {
        Row: {
          amount: number
          collection_probability: number | null
          created_at: string | null
          currency_code: string | null
          customer_id: string | null
          customer_name: string
          due_date: string
          id: string
          import_id: string | null
          invoice_no: string | null
          is_demo: boolean | null
          issue_date: string | null
          organization_id: string
          status: string | null
        }
        Insert: {
          amount: number
          collection_probability?: number | null
          created_at?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_name: string
          due_date: string
          id?: string
          import_id?: string | null
          invoice_no?: string | null
          is_demo?: boolean | null
          issue_date?: string | null
          organization_id: string
          status?: string | null
        }
        Update: {
          amount?: number
          collection_probability?: number | null
          created_at?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_name?: string
          due_date?: string
          id?: string
          import_id?: string | null
          invoice_no?: string | null
          is_demo?: boolean | null
          issue_date?: string | null
          organization_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoices_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changes_json: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string | null
          id: string
          ip_address: string | null
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          changes_json?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          changes_json?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_movements: {
        Row: {
          account_name: string | null
          amount: number
          created_at: string | null
          description: string | null
          id: string
          import_id: string | null
          organization_id: string
          posted_on: string
          reference: string | null
        }
        Insert: {
          account_name?: string | null
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          import_id?: string | null
          organization_id: string
          posted_on: string
          reference?: string | null
        }
        Update: {
          account_name?: string | null
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          import_id?: string | null
          organization_id?: string
          posted_on?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_movements_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_assumptions: {
        Row: {
          collection_curve_json: Json | null
          customer_overrides_json: Json
          id: string
          organization_id: string
          payment_policy_json: Json
          risk_thresholds_json: Json
          updated_at: string | null
          updated_by: string | null
          vendor_overrides_json: Json
        }
        Insert: {
          collection_curve_json?: Json | null
          customer_overrides_json?: Json
          id?: string
          organization_id: string
          payment_policy_json?: Json
          risk_thresholds_json?: Json
          updated_at?: string | null
          updated_by?: string | null
          vendor_overrides_json?: Json
        }
        Update: {
          collection_curve_json?: Json | null
          customer_overrides_json?: Json
          id?: string
          organization_id?: string
          payment_policy_json?: Json
          risk_thresholds_json?: Json
          updated_at?: string | null
          updated_by?: string | null
          vendor_overrides_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cash_assumptions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_positions: {
        Row: {
          account_name: string
          balance: number
          created_at: string | null
          id: string
          is_demo: boolean | null
          notes: string | null
          organization_id: string
          recorded_on: string
        }
        Insert: {
          account_name?: string
          balance: number
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          notes?: string | null
          organization_id: string
          recorded_on?: string
        }
        Update: {
          account_name?: string
          balance?: number
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          notes?: string | null
          organization_id?: string
          recorded_on?: string
        }
        Relationships: []
      }
      cash_profile: {
        Row: {
          ap_flex_days: number
          ar_payment_behavior: string
          created_at: string | null
          customer_dependency: string
          id: string
          organization_id: string
          risk_worry_threshold: string
          updated_at: string | null
        }
        Insert: {
          ap_flex_days?: number
          ar_payment_behavior?: string
          created_at?: string | null
          customer_dependency?: string
          id?: string
          organization_id: string
          risk_worry_threshold?: string
          updated_at?: string | null
        }
        Update: {
          ap_flex_days?: number
          ar_payment_behavior?: string
          created_at?: string | null
          customer_dependency?: string
          id?: string
          organization_id?: string
          risk_worry_threshold?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          type?: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          type?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          contact_email: string | null
          created_at: string | null
          credit_days: number | null
          credit_limit: number | null
          id: string
          name: string
          organization_id: string
          payment_terms_days: number | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          id?: string
          name: string
          organization_id: string
          payment_terms_days?: number | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          id?: string
          name?: string
          organization_id?: string
          payment_terms_days?: number | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          config_json: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string | null
          type: string
        }
        Insert: {
          config_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string | null
          type: string
        }
        Update: {
          config_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          committed_at: string | null
          created_at: string | null
          created_by: string | null
          errors_json: Json | null
          file_name: string | null
          id: string
          organization_id: string
          row_count: number | null
          source_type: string
          status: string | null
        }
        Insert: {
          committed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          errors_json?: Json | null
          file_name?: string | null
          id?: string
          organization_id: string
          row_count?: number | null
          source_type: string
          status?: string | null
        }
        Update: {
          committed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          errors_json?: Json | null
          file_name?: string | null
          id?: string
          organization_id?: string
          row_count?: number | null
          source_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_forecast_base: {
        Row: {
          confidence_interval_pct: number | null
          forecast_units: number
          id: string
          mape: number | null
          model_name: string | null
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
        }
        Insert: {
          confidence_interval_pct?: number | null
          forecast_units?: number
          id?: string
          mape?: number | null
          model_name?: string | null
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
        }
        Update: {
          confidence_interval_pct?: number | null
          forecast_units?: number
          id?: string
          mape?: number | null
          model_name?: string | null
          organization_id?: string
          period_date?: string
          sku_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_forecast_base_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_forecast_final: {
        Row: {
          forecast_units_final: number
          id: string
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
        }
        Insert: {
          forecast_units_final?: number
          id?: string
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
        }
        Update: {
          forecast_units_final?: number
          id?: string
          organization_id?: string
          period_date?: string
          sku_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_forecast_final_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_forecast_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          organization_id: string
          override_type: string
          override_value: number
          period_date: string
          scope_type: string
          scope_value: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          organization_id: string
          override_type: string
          override_value: number
          period_date: string
          scope_type: string
          scope_value: string
          snapshot_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          override_type?: string
          override_value?: number
          period_date?: string
          scope_type?: string
          scope_value?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_forecast_overrides_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_forecast_versions: {
        Row: {
          created_at: string | null
          id: string
          model_config: Json
          model_counts: Json | null
          organization_id: string
          override_count: number
          settings_snapshot: Json | null
          skus_errored: number
          snapshot_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_config?: Json
          model_counts?: Json | null
          organization_id: string
          override_count?: number
          settings_snapshot?: Json | null
          skus_errored?: number
          snapshot_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          model_config?: Json
          model_counts?: Json | null
          organization_id?: string
          override_count?: number
          settings_snapshot?: Json | null
          skus_errored?: number
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_forecast_versions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_health_history: {
        Row: {
          capital_at_risk: number
          capital_at_risk_ratio: number
          coverage_adequacy: number
          created_at: string | null
          forecast_reliability: number
          green_count: number
          health_score: number
          id: string
          organization_id: string
          red_count: number
          red_ratio: number
          snapshot_date: string
          snapshot_id: string
          total_capital: number
          yellow_count: number
        }
        Insert: {
          capital_at_risk?: number
          capital_at_risk_ratio?: number
          coverage_adequacy?: number
          created_at?: string | null
          forecast_reliability?: number
          green_count?: number
          health_score?: number
          id?: string
          organization_id: string
          red_count?: number
          red_ratio?: number
          snapshot_date: string
          snapshot_id: string
          total_capital?: number
          yellow_count?: number
        }
        Update: {
          capital_at_risk?: number
          capital_at_risk_ratio?: number
          coverage_adequacy?: number
          created_at?: string | null
          forecast_reliability?: number
          green_count?: number
          health_score?: number
          id?: string
          organization_id?: string
          red_count?: number
          red_ratio?: number
          snapshot_date?: string
          snapshot_id?: string
          total_capital?: number
          yellow_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_health_history_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_metrics_category: {
        Row: {
          capital_onhand: number
          category: string
          coverage_days_avg: number
          id: string
          organization_id: string
          recommended_buy: number
          red_count: number
          risk_share: number
          sku_count: number
          skus_at_risk: number
          snapshot_id: string
        }
        Insert: {
          capital_onhand?: number
          category: string
          coverage_days_avg?: number
          id?: string
          organization_id: string
          recommended_buy?: number
          red_count?: number
          risk_share?: number
          sku_count?: number
          skus_at_risk?: number
          snapshot_id: string
        }
        Update: {
          capital_onhand?: number
          category?: string
          coverage_days_avg?: number
          id?: string
          organization_id?: string
          recommended_buy?: number
          red_count?: number
          risk_share?: number
          sku_count?: number
          skus_at_risk?: number
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_metrics_category_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_metrics_sku: {
        Row: {
          buffer_units: number
          capital_onhand: number
          coverage_days: number
          demand_30d: number | null
          demand_90d: number
          demand_daily_30d: number
          id: string
          mape: number | null
          organization_id: string
          recommended_buy_units: number
          risk_level: string
          sku_id: string
          snapshot_id: string
        }
        Insert: {
          buffer_units?: number
          capital_onhand?: number
          coverage_days?: number
          demand_30d?: number | null
          demand_90d?: number
          demand_daily_30d?: number
          id?: string
          mape?: number | null
          organization_id: string
          recommended_buy_units?: number
          risk_level?: string
          sku_id: string
          snapshot_id: string
        }
        Update: {
          buffer_units?: number
          capital_onhand?: number
          coverage_days?: number
          demand_30d?: number | null
          demand_90d?: number
          demand_daily_30d?: number
          id?: string
          mape?: number | null
          organization_id?: string
          recommended_buy_units?: number
          risk_level?: string
          sku_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_metrics_sku_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_metrics_supplier: {
        Row: {
          capital_onhand: number
          coverage_days_avg: number
          id: string
          organization_id: string
          recommended_buy: number
          red_count: number
          risk_share: number
          sku_count: number
          skus_at_risk: number
          snapshot_id: string
          supplier: string
        }
        Insert: {
          capital_onhand?: number
          coverage_days_avg?: number
          id?: string
          organization_id: string
          recommended_buy?: number
          red_count?: number
          risk_share?: number
          sku_count?: number
          skus_at_risk?: number
          snapshot_id: string
          supplier: string
        }
        Update: {
          capital_onhand?: number
          coverage_days_avg?: number
          id?: string
          organization_id?: string
          recommended_buy?: number
          red_count?: number
          risk_share?: number
          sku_count?: number
          skus_at_risk?: number
          snapshot_id?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_metrics_supplier_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_onhand: {
        Row: {
          id: string
          onhand_units: number
          organization_id: string
          sku_id: string
          snapshot_id: string
        }
        Insert: {
          id?: string
          onhand_units?: number
          organization_id: string
          sku_id: string
          snapshot_id: string
        }
        Update: {
          id?: string
          onhand_units?: number
          organization_id?: string
          sku_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_onhand_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sales_history: {
        Row: {
          id: string
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
          units_sold: number
        }
        Insert: {
          id?: string
          organization_id: string
          period_date: string
          sku_id: string
          snapshot_id: string
          units_sold?: number
        }
        Update: {
          id?: string
          organization_id?: string
          period_date?: string
          sku_id?: string
          snapshot_id?: string
          units_sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sales_history_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_settings: {
        Row: {
          critical_threshold_days: number
          default_forecast_horizon: number
          id: string
          min_periods_for_hw: number
          min_periods_for_wma: number
          organization_id: string
          risk_threshold_buffer_pct: number
          seasonality_flag: boolean
          target_coverage_days: number
          updated_at: string | null
          weight_capital_at_risk: number
          weight_coverage_adequacy: number
          weight_forecast_reliability: number
          weight_red_ratio: number
        }
        Insert: {
          critical_threshold_days?: number
          default_forecast_horizon?: number
          id?: string
          min_periods_for_hw?: number
          min_periods_for_wma?: number
          organization_id: string
          risk_threshold_buffer_pct?: number
          seasonality_flag?: boolean
          target_coverage_days?: number
          updated_at?: string | null
          weight_capital_at_risk?: number
          weight_coverage_adequacy?: number
          weight_forecast_reliability?: number
          weight_red_ratio?: number
        }
        Update: {
          critical_threshold_days?: number
          default_forecast_horizon?: number
          id?: string
          min_periods_for_hw?: number
          min_periods_for_wma?: number
          organization_id?: string
          risk_threshold_buffer_pct?: number
          seasonality_flag?: boolean
          target_coverage_days?: number
          updated_at?: string | null
          weight_capital_at_risk?: number
          weight_coverage_adequacy?: number
          weight_forecast_reliability?: number
          weight_red_ratio?: number
        }
        Relationships: []
      }
      inventory_sku_master: {
        Row: {
          active_flag: boolean
          category: string
          cost_unit: number
          id: string
          lead_time_days: number
          moq: number
          organization_id: string
          price_unit: number
          sku_id: string
          sku_name: string
          supplier: string
          updated_at: string | null
        }
        Insert: {
          active_flag?: boolean
          category: string
          cost_unit?: number
          id?: string
          lead_time_days?: number
          moq?: number
          organization_id: string
          price_unit?: number
          sku_id: string
          sku_name: string
          supplier: string
          updated_at?: string | null
        }
        Update: {
          active_flag?: boolean
          category?: string
          cost_unit?: number
          id?: string
          lead_time_days?: number
          moq?: number
          organization_id?: string
          price_unit?: number
          sku_id?: string
          sku_name?: string
          supplier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_snapshots: {
        Row: {
          created_at: string | null
          created_by: string | null
          error_msg: string | null
          id: string
          label: string
          metadata: Json | null
          organization_id: string
          sku_count: number | null
          snapshot_date: string
          status: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          error_msg?: string | null
          id?: string
          label: string
          metadata?: Json | null
          organization_id: string
          sku_count?: number | null
          snapshot_date: string
          status?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          error_msg?: string | null
          id?: string
          label?: string
          metadata?: Json | null
          organization_id?: string
          sku_count?: number | null
          snapshot_date?: string
          status?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by: string
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          allowed_pages: Json | null
          id: string
          joined_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          allowed_pages?: Json | null
          id?: string
          joined_at?: string | null
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          allowed_pages?: Json | null
          id?: string
          joined_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allow_open_join: boolean
          country: string | null
          created_at: string | null
          currency: string | null
          id: string
          name: string
          owner_id: string | null
          threshold_critical: number | null
          threshold_high: number | null
          threshold_overstock: number | null
          updated_at: string | null
        }
        Insert: {
          allow_open_join?: boolean
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          threshold_critical?: number | null
          threshold_high?: number | null
          threshold_overstock?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_open_join?: boolean
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          threshold_critical?: number | null
          threshold_high?: number | null
          threshold_overstock?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_monthly: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string | null
          id: string
          is_demo: boolean
          item_name: string
          kind: string
          month: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          item_name: string
          kind: string
          month: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          item_name?: string
          kind?: string
          month?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_monthly_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_node_values: {
        Row: {
          id: string
          month: string
          node_id: string
          value: number
        }
        Insert: {
          id?: string
          month: string
          node_id: string
          value?: number
        }
        Update: {
          id?: string
          month?: string
          node_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_node_values_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "plan_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_nodes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          node_type: string
          organization_id: string
          parent_id: string | null
          position: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          node_type?: string
          organization_id: string
          parent_id?: string | null
          position?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          node_type?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "plan_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_scenario_values: {
        Row: {
          id: string
          month: string
          node_id: string
          scenario_id: string
          value: number
        }
        Insert: {
          id?: string
          month: string
          node_id: string
          scenario_id: string
          value?: number
        }
        Update: {
          id?: string
          month?: string
          node_id?: string
          scenario_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_scenario_values_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "plan_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_scenario_values_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "plan_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_scenarios: {
        Row: {
          created_at: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      promises_to_pay: {
        Row: {
          ar_invoice_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          promised_amount: number | null
          promised_date: string
          status: string
        }
        Insert: {
          ar_invoice_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          promised_amount?: number | null
          promised_date: string
          status?: string
        }
        Update: {
          ar_invoice_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          promised_amount?: number | null
          promised_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "promises_to_pay_ar_invoice_id_fkey"
            columns: ["ar_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_to_pay_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_outflows: {
        Row: {
          active: boolean | null
          amount: number
          cadence: string
          created_at: string | null
          day_of_period: number | null
          ends_on: string | null
          id: string
          is_demo: boolean | null
          name: string
          organization_id: string
          starts_on: string | null
        }
        Insert: {
          active?: boolean | null
          amount: number
          cadence: string
          created_at?: string | null
          day_of_period?: number | null
          ends_on?: string | null
          id?: string
          is_demo?: boolean | null
          name: string
          organization_id: string
          starts_on?: string | null
        }
        Update: {
          active?: boolean | null
          amount?: number
          cadence?: string
          created_at?: string | null
          day_of_period?: number | null
          ends_on?: string | null
          id?: string
          is_demo?: boolean | null
          name?: string
          organization_id?: string
          starts_on?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          ai_quota: number | null
          current_period_end: string | null
          id: string
          member_quota: number | null
          organization_id: string
          plan: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tx_quota: number | null
          updated_at: string | null
        }
        Insert: {
          ai_quota?: number | null
          current_period_end?: string | null
          id?: string
          member_quota?: number | null
          organization_id: string
          plan?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tx_quota?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_quota?: number | null
          current_period_end?: string | null
          id?: string
          member_quota?: number | null
          organization_id?: string
          plan?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tx_quota?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transaction_imports: {
        Row: {
          error: string | null
          file_name: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          organization_id: string
          row_count: number | null
          status: string | null
        }
        Insert: {
          error?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          organization_id: string
          row_count?: number | null
          status?: string | null
        }
        Update: {
          error?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          organization_id?: string
          row_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          occurred_on: string
          organization_id: string
          source: string | null
          tags: string[] | null
          type: string
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_on?: string
          organization_id: string
          source?: string | null
          tags?: string[] | null
          type: string
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_on?: string
          organization_id?: string
          source?: string | null
          tags?: string[] | null
          type?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_email: string | null
          created_at: string | null
          id: string
          name: string
          organization_id: string
          payment_terms_days: number | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          payment_terms_days?: number | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          payment_terms_days?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_admin_org_ids: { Args: never; Returns: string[] }
      get_my_org_ids: { Args: never; Returns: string[] }
      get_org_public_info: {
        Args: { p_org_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_owner_or_admin: { Args: { org_id: string }; Returns: boolean }
      refresh_monthly_summary: {
        Args: { p_month: string; p_org: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const