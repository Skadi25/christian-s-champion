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
      channel_preferences: {
        Row: {
          affinity: number
          channel_id: string
          channel_name: string | null
          created_at: string
          id: string
          negative_count: number
          neutral_count: number
          platform: string
          positive_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affinity?: number
          channel_id: string
          channel_name?: string | null
          created_at?: string
          id?: string
          negative_count?: number
          neutral_count?: number
          platform?: string
          positive_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affinity?: number
          channel_id?: string
          channel_name?: string | null
          created_at?: string
          id?: string
          negative_count?: number
          neutral_count?: number
          platform?: string
          positive_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          correct_statement: string | null
          created_at: string
          id: string
          is_active: boolean
          text: string
          topic_id: string | null
          updated_at: string
          user_id: string
          why_problematic: string | null
        }
        Insert: {
          correct_statement?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          text: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
          why_problematic?: string | null
        }
        Update: {
          correct_statement?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          text?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
          why_problematic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          user_id: string
          videos_matched: number
          videos_scanned: number
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          user_id: string
          videos_matched?: number
          videos_scanned?: number
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          user_id?: string
          videos_matched?: number
          videos_scanned?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_matches: {
        Row: {
          ai_confidence: number | null
          ai_reasoning: string | null
          ai_summary: string | null
          claim_id: string | null
          created_at: string
          detected_claim: string | null
          feedback_at: string | null
          id: string
          matched_at: string
          opportunity_score: number | null
          score_breakdown: Json | null
          status: string
          topic_id: string | null
          user_feedback: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_summary?: string | null
          claim_id?: string | null
          created_at?: string
          detected_claim?: string | null
          feedback_at?: string | null
          id?: string
          matched_at?: string
          opportunity_score?: number | null
          score_breakdown?: Json | null
          status?: string
          topic_id?: string | null
          user_feedback?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_summary?: string | null
          claim_id?: string | null
          created_at?: string
          detected_claim?: string | null
          feedback_at?: string | null
          id?: string
          matched_at?: string
          opportunity_score?: number | null
          score_breakdown?: Json | null
          status?: string
          topic_id?: string | null
          user_feedback?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_matches_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_matches_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_matches_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          comment_count: number | null
          description: string | null
          duration_seconds: number | null
          external_id: string
          fetched_at: string
          id: string
          language: string | null
          like_count: number | null
          platform: string
          published_at: string | null
          raw_metadata: Json | null
          thumbnail_url: string | null
          title: string | null
          transcript: string | null
          url: string
          view_count: number | null
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          external_id: string
          fetched_at?: string
          id?: string
          language?: string | null
          like_count?: number | null
          platform: string
          published_at?: string | null
          raw_metadata?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          url: string
          view_count?: number | null
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          external_id?: string
          fetched_at?: string
          id?: string
          language?: string | null
          like_count?: number | null
          platform?: string
          published_at?: string | null
          raw_metadata?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          url?: string
          view_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
