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
    PostgrestVersion: "14.15"
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
          active_account_id: string | null
          active_repo: string | null
          active_workspace_id: string | null
          auto_save: boolean
          created_at: string
          default_branch: string | null
          default_folder: string | null
          editor_font_size: number
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
          active_account_id?: string | null
          active_repo?: string | null
          active_workspace_id?: string | null
          auto_save?: boolean
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          editor_font_size?: number
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
          active_account_id?: string | null
          active_repo?: string | null
          active_workspace_id?: string | null
          auto_save?: boolean
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          editor_font_size?: number
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
          description: string | null
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          default_branch?: string | null
          default_folder?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_rate_limit: {
        Args: { p_bucket: string; p_user_id: string; p_window_seconds: number }
        Returns: number
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      invitation_status: "pending" | "accepted" | "rejected" | "revoked"
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
      invitation_status: ["pending", "accepted", "rejected", "revoked"],
      workspace_role: ["owner", "admin", "developer", "viewer"],
    },
  },
} as const
