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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          full_name: string
          head_id: string | null
          id: string
          is_active: boolean
          is_head: boolean
          is_owner: boolean
          job_title: string | null
          mobile: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          full_name: string
          head_id?: string | null
          id: string
          is_active?: boolean
          is_head?: boolean
          is_owner?: boolean
          job_title?: string | null
          mobile: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          full_name?: string
          head_id?: string | null
          id?: string
          is_active?: boolean
          is_head?: boolean
          is_owner?: boolean
          job_title?: string | null
          mobile?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          at: string
          changes: Json | null
          id: number
          new_row: Json | null
          old_row: Json | null
          person_id: string | null
          row_id: string
          summary: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          changes?: Json | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          person_id?: string | null
          row_id: string
          summary?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          changes?: Json | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          person_id?: string | null
          row_id?: string
          summary?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      cash_checks: {
        Row: {
          checked_at: string
          checked_by: string
          counted: number
          deleted_at: string | null
          deleted_by: string | null
          difference: number
          expected: number
          id: string
          is_deleted: boolean
          note: string | null
          person_id: string
        }
        Insert: {
          checked_at?: string
          checked_by: string
          counted: number
          deleted_at?: string | null
          deleted_by?: string | null
          difference: number
          expected: number
          id?: string
          is_deleted?: boolean
          note?: string | null
          person_id: string
        }
        Update: {
          checked_at?: string
          checked_by?: string
          counted?: number
          deleted_at?: string | null
          deleted_by?: string | null
          difference?: number
          expected?: number
          id?: string
          is_deleted?: boolean
          note?: string | null
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "cash_checks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      entries: {
        Row: {
          amount: number
          bill_date: string
          bill_scan_state: Database["public"]["Enums"]["bill_scan_state"]
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string | null
          client_id: string | null
          counterparty_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          duplicate_of: string | null
          duplicate_photo: boolean
          entered_at: string
          entered_by: string
          expense_type: Database["public"]["Enums"]["expense_kind"] | null
          id: string
          is_cancelled: boolean
          is_deleted: boolean
          note: string | null
          pay_method: Database["public"]["Enums"]["pay_method"] | null
          person_id: string
          project_id: string | null
          qr_issued_at: string | null
          qr_raw: string | null
          qr_seller_name: string | null
          qr_total: number | null
          qr_vat_amount: number | null
          qr_vat_number: string | null
          system_id: string | null
          type: Database["public"]["Enums"]["entry_type"]
          type_flags: string[]
          type_source: Database["public"]["Enums"]["type_source"] | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          amount: number
          bill_date: string
          bill_scan_state?: Database["public"]["Enums"]["bill_scan_state"]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string | null
          client_id?: string | null
          counterparty_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_of?: string | null
          duplicate_photo?: boolean
          entered_at?: string
          entered_by: string
          expense_type?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_cancelled?: boolean
          is_deleted?: boolean
          note?: string | null
          pay_method?: Database["public"]["Enums"]["pay_method"] | null
          person_id: string
          project_id?: string | null
          qr_issued_at?: string | null
          qr_raw?: string | null
          qr_seller_name?: string | null
          qr_total?: number | null
          qr_vat_amount?: number | null
          qr_vat_number?: string | null
          system_id?: string | null
          type: Database["public"]["Enums"]["entry_type"]
          type_flags?: string[]
          type_source?: Database["public"]["Enums"]["type_source"] | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          amount?: number
          bill_date?: string
          bill_scan_state?: Database["public"]["Enums"]["bill_scan_state"]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string | null
          client_id?: string | null
          counterparty_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_of?: string | null
          duplicate_photo?: boolean
          entered_at?: string
          entered_by?: string
          expense_type?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_cancelled?: boolean
          is_deleted?: boolean
          note?: string | null
          pay_method?: Database["public"]["Enums"]["pay_method"] | null
          person_id?: string
          project_id?: string | null
          qr_issued_at?: string | null
          qr_raw?: string | null
          qr_seller_name?: string | null
          qr_total?: number | null
          qr_vat_amount?: number | null
          qr_vat_number?: string | null
          system_id?: string | null
          type?: Database["public"]["Enums"]["entry_type"]
          type_flags?: string[]
          type_source?: Database["public"]["Enums"]["type_source"] | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "cancelled_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "deleted_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "expenses_to_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "invoice_details"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "suspected_duplicates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "suspected_duplicates"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      entry_photos: {
        Row: {
          bytes: number | null
          created_at: string
          entry_id: string
          height: number | null
          id: string
          phash: string | null
          position: number
          sha256: string
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          entry_id: string
          height?: number | null
          id?: string
          phash?: string | null
          position?: number
          sha256: string
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          entry_id?: string
          height?: number | null
          id?: string
          phash?: string | null
          position?: number
          sha256?: string
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "cancelled_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "deleted_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "expenses_to_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "invoice_details"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "suspected_duplicates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "suspected_duplicates"
            referencedColumns: ["other_id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string
          id: string
          is_hidden: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          is_hidden?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          is_hidden?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      expense_counters: {
        Row: {
          next_no: number
          year: number
        }
        Insert: {
          next_no?: number
          year: number
        }
        Update: {
          next_no?: number
          year?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_minor: number
          category: string
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          group_id: string
          id: string
          items: Json | null
          note: string | null
          paid_by_id: string
          rate_to_group: number
          receipt_uri: string | null
          split_mode: string
          splits: Json
          title: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          category: string
          created_at?: string
          currency: string
          date: string
          deleted_at?: string | null
          group_id: string
          id: string
          items?: Json | null
          note?: string | null
          paid_by_id: string
          rate_to_group?: number
          receipt_uri?: string | null
          split_mode: string
          splits: Json
          title: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          items?: Json | null
          note?: string | null
          paid_by_id?: string
          rate_to_group?: number
          receipt_uri?: string | null
          split_mode?: string
          splits?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          code: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          name: string
          sync_secret: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency: string
          deleted_at?: string | null
          id: string
          name: string
          sync_secret?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          name?: string
          sync_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      history: {
        Row: {
          action: string
          actor_name: string
          at: string
          created_at: string
          detail: string | null
          group_id: string
          id: string
          summary: string
        }
        Insert: {
          action: string
          actor_name: string
          at: string
          created_at?: string
          detail?: string | null
          group_id: string
          id: string
          summary: string
        }
        Update: {
          action?: string
          actor_name?: string
          at?: string
          created_at?: string
          detail?: string | null
          group_id?: string
          id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          at: string
          id: number
          mobile: string
          reason: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          at?: string
          id?: never
          mobile: string
          reason?: string | null
          success: boolean
          user_id?: string | null
        }
        Update: {
          at?: string
          id?: never
          mobile?: string
          reason?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      members: {
        Row: {
          deleted_at: string | null
          device_id: string | null
          group_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          device_id?: string | null
          group_id: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          device_id?: string | null
          group_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          from_id: string
          group_id: string
          id: string
          note: string | null
          rate_to_group: number
          to_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          date: string
          deleted_at?: string | null
          from_id: string
          group_id: string
          id: string
          note?: string | null
          rate_to_group?: number
          to_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          from_id?: string
          group_id?: string
          id?: string
          note?: string | null
          rate_to_group?: number
          to_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      report_downloads: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          at: string
          category_name: string | null
          from_date: string | null
          id: number
          kind: string
          note: string | null
          person_id: string | null
          person_name: string | null
          row_count: number | null
          to_date: string | null
          total: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          category_name?: string | null
          from_date?: string | null
          id?: never
          kind: string
          note?: string | null
          person_id?: string | null
          person_name?: string | null
          row_count?: number | null
          to_date?: string | null
          total?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          category_name?: string | null
          from_date?: string | null
          id?: never
          kind?: string
          note?: string | null
          person_id?: string | null
          person_name?: string | null
          row_count?: number | null
          to_date?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      user_secrets: {
        Row: {
          auth_password: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          pin_set_at: string
          pin_set_by: string | null
          user_id: string
        }
        Insert: {
          auth_password: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          pin_set_at?: string
          pin_set_by?: string | null
          user_id: string
        }
        Update: {
          auth_password?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          pin_set_at?: string
          pin_set_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_secrets_pin_set_by_fkey"
            columns: ["pin_set_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_pin_set_by_fkey"
            columns: ["pin_set_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_pin_set_by_fkey"
            columns: ["pin_set_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_pin_set_by_fkey"
            columns: ["pin_set_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "user_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
    }
    Views: {
      audit_feed: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_name: string | null
          at: string | null
          changes: Json | null
          id: number | null
          person_id: string | null
          person_name: string | null
          row_id: string | null
          summary: string | null
          table_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      cancelled_entries: {
        Row: {
          amount: number | null
          bill_date: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          category_icon: string | null
          category_name: string | null
          entered_by: string | null
          entered_by_name: string | null
          expense_type: Database["public"]["Enums"]["expense_kind"] | null
          id: string | null
          note: string | null
          person_id: string | null
          person_name: string | null
          system_id: string | null
          type: Database["public"]["Enums"]["entry_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      cash_check_feed: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checked_by_name: string | null
          counted: number | null
          difference: number | null
          expected: number | null
          id: string | null
          note: string | null
          person_id: string | null
          person_name: string | null
          result: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      deleted_entries: {
        Row: {
          amount: number | null
          bill_date: string | null
          category_icon: string | null
          category_name: string | null
          counterparty_id: string | null
          counterparty_name: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          entered_at: string | null
          entered_by: string | null
          entered_by_name: string | null
          id: string | null
          note: string | null
          person_id: string | null
          person_name: string | null
          type: Database["public"]["Enums"]["entry_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      entry_feed: {
        Row: {
          amount: number | null
          bill_date: string | null
          bill_scan_state: Database["public"]["Enums"]["bill_scan_state"] | null
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          counterparty_id: string | null
          counterparty_name: string | null
          duplicate_photo: boolean | null
          entered_at: string | null
          entered_by: string | null
          entered_by_name: string | null
          entered_for_someone_else: boolean | null
          expense_type: Database["public"]["Enums"]["expense_kind"] | null
          id: string | null
          line_type: string | null
          note: string | null
          other_person_id: string | null
          other_person_name: string | null
          owner_id: string | null
          owner_name: string | null
          pay_method: Database["public"]["Enums"]["pay_method"] | null
          person_id: string | null
          photo_count: number | null
          project_id: string | null
          signed_amount: number | null
          system_id: string | null
          thumb_path: string | null
          type: Database["public"]["Enums"]["entry_type"] | null
          type_flags: string[] | null
          type_source: Database["public"]["Enums"]["type_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      entry_lines: {
        Row: {
          entry_id: string | null
          line_type: string | null
          other_person_id: string | null
          pay_method: Database["public"]["Enums"]["pay_method"] | null
          person_id: string | null
          signed_amount: number | null
        }
        Relationships: []
      }
      expenses_to_check: {
        Row: {
          amount: number | null
          bill_date: string | null
          bill_scan_state: Database["public"]["Enums"]["bill_scan_state"] | null
          category_icon: string | null
          category_name: string | null
          entered_at: string | null
          expense_type: Database["public"]["Enums"]["expense_kind"] | null
          id: string | null
          note: string | null
          person_id: string | null
          person_name: string | null
          photo_count: number | null
          qr_total: number | null
          system_id: string | null
          thumb_path: string | null
          type_flags: string[] | null
          type_source: Database["public"]["Enums"]["type_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      invoice_details: {
        Row: {
          amount_differs: boolean | null
          entry_id: string | null
          qr_issued_at: string | null
          qr_seller_name: string | null
          qr_total: number | null
          qr_vat_amount: number | null
          qr_vat_number: string | null
          system_id: string | null
          vat_number: string | null
        }
        Insert: {
          amount_differs?: never
          entry_id?: string | null
          qr_issued_at?: string | null
          qr_seller_name?: string | null
          qr_total?: number | null
          qr_vat_amount?: number | null
          qr_vat_number?: string | null
          system_id?: string | null
          vat_number?: string | null
        }
        Update: {
          amount_differs?: never
          entry_id?: string | null
          qr_issued_at?: string | null
          qr_seller_name?: string | null
          qr_total?: number | null
          qr_vat_amount?: number | null
          qr_vat_number?: string | null
          system_id?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      people_list: {
        Row: {
          balance: number | null
          check_count: number | null
          created_at: string | null
          created_by_name: string | null
          disabled_at: string | null
          entry_count: number | null
          expenses: number | null
          full_name: string | null
          head_id: string | null
          head_name: string | null
          id: string | null
          in_cash: number | null
          in_transfer: number | null
          invoice_total: number | null
          is_active: boolean | null
          is_head: boolean | null
          is_owner: boolean | null
          job_title: string | null
          last_check_difference: number | null
          last_check_result: string | null
          last_checked_at: string | null
          last_entry_at: string | null
          mobile: string | null
          money_given: number | null
          out_cash: number | null
          out_transfer: number | null
          petty_total: number | null
          returned: number | null
          role: Database["public"]["Enums"]["user_role"] | null
          short_count: number | null
          team_count: number | null
          total_extra: number | null
          total_short: number | null
          transfers_in: number | null
          transfers_out: number | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      people_names: {
        Row: {
          full_name: string | null
          head_id: string | null
          id: string | null
          is_active: boolean | null
          is_head: boolean | null
          is_owner: boolean | null
        }
        Insert: {
          full_name?: string | null
          head_id?: string | null
          id?: string | null
          is_active?: boolean | null
          is_head?: boolean | null
          is_owner?: boolean | null
        }
        Update: {
          full_name?: string | null
          head_id?: string | null
          id?: string | null
          is_active?: boolean | null
          is_head?: boolean | null
          is_owner?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      person_check_summary: {
        Row: {
          check_count: number | null
          extra_count: number | null
          last_checked_at: string | null
          matched_count: number | null
          person_id: string | null
          short_count: number | null
          total_extra: number | null
          total_short: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_checks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      person_totals: {
        Row: {
          balance: number | null
          entry_count: number | null
          expenses: number | null
          in_cash: number | null
          in_transfer: number | null
          money_given: number | null
          out_cash: number | null
          out_transfer: number | null
          person_id: string | null
          returned: number | null
          transfers_in: number | null
          transfers_out: number | null
        }
        Relationships: []
      }
      report_download_log: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          at: string | null
          category_name: string | null
          from_date: string | null
          id: number | null
          kind: string | null
          note: string | null
          person_id: string | null
          person_name: string | null
          row_count: number | null
          to_date: string | null
          total: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          at?: string | null
          category_name?: string | null
          from_date?: string | null
          id?: number | null
          kind?: string | null
          note?: string | null
          person_id?: string | null
          person_name?: string | null
          row_count?: number | null
          to_date?: string | null
          total?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          at?: string | null
          category_name?: string | null
          from_date?: string | null
          id?: number | null
          kind?: string | null
          note?: string | null
          person_id?: string | null
          person_name?: string | null
          row_count?: number | null
          to_date?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_downloads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      suspected_duplicates: {
        Row: {
          amount: number | null
          bill_date: string | null
          category_name: string | null
          entered_at: string | null
          entered_by_name: string | null
          expense_type: Database["public"]["Enums"]["expense_kind"] | null
          id: string | null
          note: string | null
          other_amount: number | null
          other_bill_date: string | null
          other_category_name: string | null
          other_entered_at: string | null
          other_id: string | null
          other_note: string | null
          other_person_name: string | null
          other_system_id: string | null
          other_thumb_path: string | null
          person_id: string | null
          person_name: string | null
          system_id: string | null
          thumb_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_summary"
            referencedColumns: ["head_id"]
          },
        ]
      }
      team_summary: {
        Row: {
          head_cash: number | null
          head_id: string | null
          head_job_title: string | null
          head_name: string | null
          people_count: number | null
          team_cash: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_bill_scan: {
        Args: {
          p_entry_id: string
          p_failed?: boolean
          p_found: boolean
          p_qr?: Json
          p_source?: Database["public"]["Enums"]["type_source"]
          p_vat?: string
        }
        Returns: undefined
      }
      audit_noise_keys: { Args: never; Returns: string[] }
      axvera_authorised: {
        Args: { p_group_id: string; p_secret: string }
        Returns: boolean
      }
      axvera_pull: {
        Args: { p_group_id: string; p_secret: string; p_since?: string }
        Returns: Json
      }
      axvera_push: {
        Args: {
          p_expenses?: Json
          p_group?: Json
          p_group_id: string
          p_history?: Json
          p_members?: Json
          p_payments?: Json
          p_secret: string
        }
        Returns: Json
      }
      backfill_expense_ids: { Args: never; Returns: number }
      cancel_entry: {
        Args: { p_id: string; p_reason?: string }
        Returns: string
      }
      check_duplicates: {
        Args: {
          p_amount?: number
          p_bill_date?: string
          p_hashes?: string[]
          p_person_id?: string
        }
        Returns: Json
      }
      check_invoice_duplicate: {
        Args: { p_issued_at: string; p_total: number; p_vat_number: string }
        Returns: Json
      }
      check_photo_duplicate: {
        Args: {
          p_amount?: number
          p_bill_date?: string
          p_distance?: number
          p_person_id?: string
          p_phash?: string[]
          p_sha?: string[]
        }
        Returns: Json
      }
      clear_type_flags: { Args: { p_id: string }; Returns: string }
      create_entry: {
        Args: {
          p_amount: number
          p_bill_date: string
          p_category_id?: string
          p_client_id?: string
          p_counterparty_id?: string
          p_duplicate_of?: string
          p_expense_type?: Database["public"]["Enums"]["expense_kind"]
          p_flags?: string[]
          p_note?: string
          p_pay_method?: Database["public"]["Enums"]["pay_method"]
          p_person_id: string
          p_photos?: Json
          p_qr?: Json
          p_type: Database["public"]["Enums"]["entry_type"]
          p_type_source?: Database["public"]["Enums"]["type_source"]
        }
        Returns: string
      }
      create_person: {
        Args: {
          p_auth_password: string
          p_created_by?: string
          p_full_name: string
          p_id: string
          p_is_owner: boolean
          p_job_title?: string
          p_mobile: string
          p_pin_hash: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          full_name: string
          head_id: string | null
          id: string
          is_active: boolean
          is_head: boolean
          is_owner: boolean
          job_title: string | null
          mobile: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "app_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      delete_cash_check: { Args: { p_id: string }; Returns: string }
      delete_entry: {
        Args: { p_id: string; p_reason?: string }
        Returns: string
      }
      expense_report: {
        Args: {
          p_category_id?: string
          p_from?: string
          p_kind?: Database["public"]["Enums"]["expense_kind"]
          p_person_id?: string
          p_to?: string
        }
        Returns: {
          amount: number
          bill_date: string
          category_id: string
          category_name: string
          entered_at: string
          entered_by_name: string
          expense_type: Database["public"]["Enums"]["expense_kind"]
          id: string
          note: string
          person_id: string
          person_name: string
          photo_count: number
          qr_seller_name: string
          system_id: string
          type_source: Database["public"]["Enums"]["type_source"]
          vat_number: string
        }[]
      }
      expense_report_totals: {
        Args: {
          p_category_id?: string
          p_from?: string
          p_person_id?: string
          p_to?: string
        }
        Returns: Json
      }
      expenses_by_category: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          category_id: string
          entry_count: number
          icon: string
          name: string
          total: number
        }[]
      }
      expenses_by_month: {
        Args: { p_months?: number }
        Returns: {
          label: string
          month: string
          total: number
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_head: { Args: never; Returns: boolean }
      join_group_by_code: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          currency: string
          id: string
          name: string
          sync_secret: string
          updated_at: string
        }[]
      }
      log_report_download:
        | {
            Args: {
              p_from?: string
              p_kind: string
              p_note?: string
              p_person_id?: string
              p_rows?: number
              p_to?: string
              p_total?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_category_id?: string
              p_from?: string
              p_kind: string
              p_note?: string
              p_person_id?: string
              p_rows?: number
              p_to?: string
              p_total?: number
            }
            Returns: undefined
          }
      my_team_ids: { Args: never; Returns: string[] }
      next_expense_id: { Args: { p_year: number }; Returns: string }
      people_needing_check: {
        Args: { p_days?: number }
        Returns: {
          balance: number
          full_name: string
          last_checked_at: string
          person_id: string
        }[]
      }
      phash_distance: { Args: { a: string; b: string }; Returns: number }
      record_cash_check: {
        Args: { p_counted: number; p_note?: string; p_person_id: string }
        Returns: string
      }
      report_photos: {
        Args: {
          p_category_id?: string
          p_from?: string
          p_kind?: Database["public"]["Enums"]["expense_kind"]
          p_person_id?: string
          p_to?: string
        }
        Returns: {
          amount: number
          bill_date: string
          category_name: string
          entered_at: string
          entry_id: string
          expense_type: Database["public"]["Enums"]["expense_kind"]
          person_name: string
          photo_index: number
          photo_total: number
          storage_path: string
          system_id: string
        }[]
      }
      resolve_duplicate: {
        Args: { p_action: string; p_id: string; p_reason?: string }
        Returns: string
      }
      restore_entry: { Args: { p_id: string }; Returns: string }
      set_expense_type: {
        Args: {
          p_id: string
          p_reason?: string
          p_type: Database["public"]["Enums"]["expense_kind"]
        }
        Returns: string
      }
      set_person_pin: {
        Args: { p_pin_hash: string; p_set_by: string; p_user_id: string }
        Returns: undefined
      }
      top_cash_holders: {
        Args: { p_limit?: number }
        Returns: {
          balance: number
          full_name: string
          head_name: string
          person_id: string
        }[]
      }
      uncancel_entry: { Args: { p_id: string }; Returns: string }
      update_entry: {
        Args: {
          p_amount?: number
          p_bill_date?: string
          p_category_id?: string
          p_clear_note?: boolean
          p_counterparty_id?: string
          p_id: string
          p_note?: string
          p_person_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      bill_scan_state: "not_needed" | "pending" | "done" | "failed"
      entry_type: "money_given" | "transfer" | "expense" | "returned"
      expense_kind: "petty" | "invoice"
      pay_method: "cash" | "transfer"
      type_source:
        | "auto_qr"
        | "auto_vat_text"
        | "auto_none"
        | "manual"
        | "changed_by_admin"
      user_role: "admin" | "sub_admin" | "employee"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      bill_scan_state: ["not_needed", "pending", "done", "failed"],
      entry_type: ["money_given", "transfer", "expense", "returned"],
      expense_kind: ["petty", "invoice"],
      pay_method: ["cash", "transfer"],
      type_source: [
        "auto_qr",
        "auto_vat_text",
        "auto_none",
        "manual",
        "changed_by_admin",
      ],
      user_role: ["admin", "sub_admin", "employee"],
    },
  },
} as const
