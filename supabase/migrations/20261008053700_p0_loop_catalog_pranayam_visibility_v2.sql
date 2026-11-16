
      UPDATE public.loop_titles
      SET status='approved',
          listed=true,
          published=true,
          updated_at=timezone('utc'::text, now())
      WHERE slug='pranayam-1947';
