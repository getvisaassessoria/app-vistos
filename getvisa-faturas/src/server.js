import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wysojnuidpsfsiatvefo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5c29qbnVpZHBzZnNpYXR2ZWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjE2MjAsImV4cCI6MjEwMDQ5NzYyMH0.MLKnRndYEA3h584CvbxUQXwEuQf_NNzdiQj_vTq2yKU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);