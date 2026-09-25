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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          api_key_ciphertext: string
          base_url: string | null
          created_at: string
          enabled: boolean
          id: string
          is_default: boolean
          key_hint: string
          label: string | null
          model: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_ciphertext: string
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          key_hint?: string
          label?: string | null
          model?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_ciphertext?: string
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          key_hint?: string
          label?: string | null
          model?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      drafts: {
        Row: {
          base_sha: string | null
          branch: string
          content: string
          created_at: string
          full_name: string
          id: string
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_sha?: string | null
          branch: string
          content?: string
          created_at?: string
          full_name: string
          id?: string
          path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_sha?: string | null
          branch?: string
          content?: string
          created_at?: string
          full_name?: string
          id?: string
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_paths: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_favorite: boolean
          kind: string
          last_used_at: string
          path: string
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_favorite?: boolean
          kind?: string
          last_used_at?: string
          path: string
          use_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_favorite?: boolean
          kind?: string
          last_used_at?: string
          path?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          created_at: string
          email: string
          feature: string
          gitpush_username: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          feature: string
          gitpush_username: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          feature?: string
          gitpush_username?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_accounts: {
        Row: {
          avatar_url: string | null
          connection_type: string
          created_at: string
          display_name: string | null
          encrypted_token: string
          id: string
          label: string | null
          last_sync: string | null
          login: string
          repo_count: number
          scopes: string | null
          status: string
          token_hint: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          connection_type?: string
          created_at?: string
          display_name?: string | null
          encrypted_token: string
          id?: string
          label?: string | null
          last_sync?: string | null
          login: string
          repo_count?: number
          scopes?: string | null
          status?: string
          token_hint?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          connection_type?: string
          created_at?: string
          display_name?: string | null
          encrypted_token?: string
          id?: string
          label?: string | null
          last_sync?: string | null
          login?: string
          repo_count?: number
          scopes?: string | null
          status?: string
          token_hint?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      link_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          repo_full_name: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          repo_full_name?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          repo_full_name?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      recent_files: {
        Row: {
          account_id: string | null
          branch: string
          created_at: string
          full_name: string
          id: string
          last_opened_at: string
          open_count: number
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          branch: string
          created_at?: string
          full_name: string
          id?: string
          last_opened_at?: string
          open_count?: number
          path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          branch?: string
          created_at?: string
          full_name?: string
          id?: string
          last_opened_at?: string
          open_count?: number
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recent_pushes: {
        Row: {
          account_id: string | null
          action: string
          branch: string
          commit_message: string
          commit_sha: string | null
          commit_url: string | null
          created_at: string
          error_message: string | null
          full_name: string
          id: string
          path: string
          status: string
          undone_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          action?: string
          branch: string
          commit_message: string
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          error_message?: string | null
          full_name: string
          id?: string
          path: string
          status?: string
          undone_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          action?: string
          branch?: string
          commit_message?: string
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          error_message?: string | null
          full_name?: string
          id?: string
          path?: string
          status?: string
          undone_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_pushes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_access_links: {
        Row: {
          account_id: string
          allow_download: boolean
          created_at: string
          created_by: string
          expires_at: string
          full_name: string
          id: string
          last_used_at: string | null
          max_uses: number | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          token_hash: string
          token_prefix: string
          uses_count: number
          workspace_id: string
        }
        Insert: {
          account_id: string
          allow_download?: boolean
          created_at?: string
          created_by: string
          expires_at: string
          full_name: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          status?: string
          token_hash: string
          token_prefix: string
          uses_count?: number
          workspace_id: string
        }
        Update: {
          account_id?: string
          allow_download?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string
          full_name?: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          token_hash?: string
          token_prefix?: string
          uses_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_access_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_access_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_access_sessions: {
        Row: {
          account_id: string
          allow_download: boolean
          created_at: string
          expires_at: string
          full_name: string
          id: string
          last_seen_at: string
          link_id: string
          revoked_at: string | null
          role: string
          session_token_hash: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          allow_download?: boolean
          created_at?: string
          expires_at: string
          full_name: string
          id?: string
          last_seen_at?: string
          link_id: string
          revoked_at?: string | null
          role: string
          session_token_hash: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          allow_download?: boolean
          created_at?: string
          expires_at?: string
          full_name?: string
          id?: string
          last_seen_at?: string
          link_id?: string
          revoked_at?: string | null
          role?: string
          session_token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_access_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_access_sessions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "repo_access_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_access_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_prefs: {
        Row: {
          account_id: string | null
          created_at: string
          full_name: string
          id: string
          is_favorite: boolean
          last_used_at: string
          preferred_branch: string | null
          updated_at: string
          user_id: string
          working_folder: string | null
          workspace_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string
          preferred_branch?: string | null
          updated_at?: string
          user_id: string
          working_folder?: string | null
          workspace_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string
          preferred_branch?: string | null
          updated_at?: string
          user_id?: string
          working_folder?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repo_prefs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_prefs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_share_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          full_name: string | null
          id: string
          ip_hash: string | null
          link_id: string | null
          metadata: Json
          session_id: string | null
          temp_public_id: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          full_name?: string | null
          id?: string
          ip_hash?: string | null
          link_id?: string | null
          metadata?: Json
          session_id?: string | null
          temp_public_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          full_name?: string | null
          id?: string
          ip_hash?: string | null
          link_id?: string | null
          metadata?: Json
          session_id?: string | null
          temp_public_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repo_share_audit_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "repo_access_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_share_audit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "repo_access_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_share_audit_temp_public_id_fkey"
            columns: ["temp_public_id"]
            isOneToOne: false
            referencedRelation: "repo_temp_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_share_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_temp_public: {
        Row: {
          account_id: string
          created_at: string
          created_by: string
          error_count: number
          expires_at: string
          extended_count: number
          full_name: string
          id: string
          last_error: string | null
          previous_private: boolean
          reverted_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by: string
          error_count?: number
          expires_at: string
          extended_count?: number
          full_name: string
          id?: string
          last_error?: string | null
          previous_private?: boolean
          reverted_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string
          error_count?: number
          expires_at?: string
          extended_count?: number
          full_name?: string
          id?: string
          last_error?: string | null
          previous_private?: boolean
          reverted_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_temp_public_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_temp_public_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          last_event: string | null
          last_event_at: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_plan_code: string | null
          paystack_subscription_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          last_event?: string | null
          last_event_at?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_plan_code?: string | null
          paystack_subscription_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          last_event?: string | null
          last_event_at?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_plan_code?: string | null
          paystack_subscription_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          accent_color: string | null
          active_account_id: string | null
          active_repo: string | null
          active_workspace_id: string | null
          auto_save: boolean
          created_at: string
          default_branch: string | null
          default_folder: string | null
          editor_font: string
          editor_font_size: number
          editor_line_height: number
          editor_minimap: boolean
          editor_theme: string
          notifications: boolean
          plan: string
          plan_updated_at: string | null
          tab_width: number
          theme: string
          updated_at: string
          user_id: string
          word_wrap: boolean
        }
        Insert: {
          accent_color?: string | null
          active_account_id?: string | null
          active_repo?: string | null
          active_workspace_id?: string | null
          auto_save?: boolean
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          editor_font?: string
          editor_font_size?: number
          editor_line_height?: number
          editor_minimap?: boolean
          editor_theme?: string
          notifications?: boolean
          plan?: string
          plan_updated_at?: string | null
          tab_width?: number
          theme?: string
          updated_at?: string
          user_id: string
          word_wrap?: boolean
        }
        Update: {
          accent_color?: string | null
          active_account_id?: string | null
          active_repo?: string | null
          active_workspace_id?: string | null
          auto_save?: boolean
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          editor_font?: string
          editor_font_size?: number
          editor_line_height?: number
          editor_minimap?: boolean
          editor_theme?: string
          notifications?: boolean
          plan?: string
          plan_updated_at?: string | null
          tab_width?: number
          theme?: string
          updated_at?: string
          user_id?: string
          word_wrap?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          developer_mode: boolean
          role: string
          subscription_plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          developer_mode?: boolean
          role?: string
          subscription_plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          developer_mode?: boolean
          role?: string
          subscription_plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_activity: {
        Row: {
          action: Database["public"]["Enums"]["workspace_activity_action"]
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          repo_full_name: string | null
          summary: string
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["workspace_activity_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          repo_full_name?: string | null
          summary: string
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["workspace_activity_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          repo_full_name?: string | null
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_providers: {
        Row: {
          api_key_ciphertext: string
          base_url: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          is_default: boolean
          key_hint: string
          label: string | null
          model: string | null
          provider: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          api_key_ciphertext: string
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          key_hint?: string
          label?: string | null
          model?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          api_key_ciphertext?: string
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          key_hint?: string
          label?: string | null
          model?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_providers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          responded_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          last_active_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          avatar_url: string | null
          created_at: string
          default_branch: string | null
          default_folder: string | null
          default_gitignore_template: string | null
          default_invite_role: string
          default_license_template: string | null
          default_repo_auto_init: boolean
          default_repo_visibility: string
          description: string | null
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          require_team_ai_keys: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          default_gitignore_template?: string | null
          default_invite_role?: string
          default_license_template?: string | null
          default_repo_auto_init?: boolean
          default_repo_visibility?: string
          description?: string | null
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          require_team_ai_keys?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          default_gitignore_template?: string | null
          default_invite_role?: string
          default_license_template?: string | null
          default_repo_auto_init?: boolean
          default_repo_visibility?: string
          description?: string | null
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          require_team_ai_keys?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_expired_temp_public: {
        Args: { p_limit?: number }
        Returns: {
          account_id: string
          created_at: string
          created_by: string
          error_count: number
          expires_at: string
          extended_count: number
          full_name: string
          id: string
          last_error: string | null
          previous_private: boolean
          reverted_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_temp_public"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_stale_access_links: { Args: never; Returns: undefined }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      increment_rate_limit: {
        Args: { p_bucket: string; p_user_id: string; p_window_seconds: number }
        Returns: number
      }
      increment_text_rate_limit: {
        Args: { p_key: string; p_window_seconds: number }
        Returns: number
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      prune_stale_link_rate_limits: { Args: never; Returns: undefined }
      prune_stale_notifications: { Args: never; Returns: undefined }
      prune_stale_repo_share_audit: { Args: never; Returns: undefined }
      prune_stale_repo_temp_public: { Args: never; Returns: undefined }
      prune_stale_workspace_activity: { Args: never; Returns: undefined }
      redeem_access_link: {
        Args: { p_token_hash: string }
        Returns: {
          account_id: string
          allow_download: boolean
          created_at: string
          created_by: string
          expires_at: string
          full_name: string
          id: string
          last_used_at: string | null
          max_uses: number | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          token_hash: string
          token_prefix: string
          uses_count: number
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_access_links"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      invitation_status: "pending" | "accepted" | "rejected" | "revoked"
      notification_type:
        | "workspace_invited"
        | "workspace_removed"
        | "repository_shared"
        | "ai_generation_completed"
        | "push_completed"
        | "repository_archived"
      workspace_activity_action:
        | "repository_created"
        | "repository_deleted"
        | "push_completed"
        | "ai_generation"
        | "ai_edit"
        | "prompt_created"
        | "member_joined"
        | "member_removed"
        | "workspace_updated"
        | "team_key_added"
        | "team_key_removed"
        | "login"
        | "member_invited"
        | "member_left"
        | "member_role_changed"
        | "ownership_transferred"
        | "workspace_archived"
        | "ai_chat"
        | "ai_commit_message"
        | "team_key_updated"
        | "push_undone"
      workspace_role: "owner" | "admin" | "developer" | "viewer"
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
  public: {
    Enums: {
      invitation_status: ["pending", "accepted", "rejected", "revoked"],
      notification_type: [
        "workspace_invited",
        "workspace_removed",
        "repository_shared",
        "ai_generation_completed",
        "push_completed",
        "repository_archived",
      ],
      workspace_activity_action: [
        "repository_created",
        "repository_deleted",
        "push_completed",
        "ai_generation",
        "ai_edit",
        "prompt_created",
        "member_joined",
        "member_removed",
        "workspace_updated",
        "team_key_added",
        "team_key_removed",
        "login",
        "member_invited",
        "member_left",
        "member_role_changed",
        "ownership_transferred",
        "workspace_archived",
        "ai_chat",
        "ai_commit_message",
        "team_key_updated",
        "push_undone",
      ],
      workspace_role: ["owner", "admin", "developer", "viewer"],
    },
  },
} as const
